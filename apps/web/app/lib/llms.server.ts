/** Responses for the llms.txt files: plain text so browsers show them instead of downloading. */
export function textResponse(body: string, cacheControl: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': cacheControl },
  });
}
