vcl 4.1;

# HTTP cache in front of the web app and the API.
#
#   ingress -> varnish -> /api/*      -> api  (never cached)
#                      -> everything  -> web  (cached per s-maxage)
#
# The API sends "BAN" requests with an X-Ban-Url regex when a page changes, so published
# pages can stay cached for a day and still update the moment someone edits them.
# BANs are only accepted on the separate "purge" listener (varnishd -a purge=:8081), which
# is reachable inside the cluster but never through the ingress.

backend web {
  .host = "web";
  .port = "3000";
  .connect_timeout = 2s;
  .first_byte_timeout = 30s;
  .probe = { .url = "/robots.txt"; .interval = 5s; .timeout = 2s; .window = 5; .threshold = 3; }
}

backend api {
  .host = "api";
  .port = "4000";
  .connect_timeout = 2s;
  .first_byte_timeout = 30s;
}

# Second line of defence: only private addresses may ban.
acl purgers {
  "127.0.0.1";
  "10.0.0.0"/8;
  "100.64.0.0"/10;
  "172.16.0.0"/12;
  "192.168.0.0"/16;
}

sub vcl_recv {
  if (local.socket == "purge") {
    if (req.method != "BAN") {
      return (synth(405, "Only BAN on this port"));
    }
    if (!client.ip ~ purgers) {
      return (synth(403, "Forbidden"));
    }
    if (!req.http.X-Ban-Url) {
      return (synth(400, "X-Ban-Url missing"));
    }
    ban("obj.http.x-url ~ " + req.http.X-Ban-Url);
    return (synth(200, "Banned"));
  }
  if (req.method == "BAN" || req.method == "PURGE") {
    return (synth(405, "Not allowed"));
  }

  if (req.url ~ "^/api/") {
    set req.backend_hint = api;
    return (pass);
  }

  set req.backend_hint = web;
  if (req.method != "GET" && req.method != "HEAD") {
    return (pass);
  }

  # The web app renders the same HTML for everyone; who is logged in is fetched by the
  # browser from /api/auth/me. Dropping cookies makes every page cacheable.
  unset req.http.Cookie;

  # Tracking parameters do not change the page.
  set req.url = regsuball(req.url, "([?&])(utm_[a-z]+|fbclid|gclid)=[^&]*", "\1");
  set req.url = regsub(req.url, "[?&]+$", "");

  return (hash);
}

sub vcl_hash {
  # Subdomains redirect to the apex, so the host is part of the key.
  hash_data(req.url);
  hash_data(req.http.host);
  return (lookup);
}

sub vcl_backend_response {
  # Remember the URL on the object so bans can match it ("lurker-friendly" bans).
  set beresp.http.x-url = bereq.url;

  # Keep serving a stale copy for a day while refreshing, or while the web pods are down.
  set beresp.grace = 24h;

  # A response that sets a cookie is personal: never store it.
  if (beresp.http.Set-Cookie) {
    set beresp.uncacheable = true;
    set beresp.ttl = 120s;
    return (deliver);
  }
}

sub vcl_deliver {
  unset resp.http.x-url;
  if (obj.hits > 0) {
    set resp.http.X-Cache = "HIT";
  } else {
    set resp.http.X-Cache = "MISS";
  }
}
