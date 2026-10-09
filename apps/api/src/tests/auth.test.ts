import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, register, resetDatabase, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDatabase(ctx));

describe('auth', () => {
  it('registers, reports the session and logs out', async () => {
    const { cookie, user } = await register(ctx, 'Anna@Example.com', 'Anna');
    expect(user).toMatchObject({ email: 'anna@example.com', displayName: 'Anna', role: 'user' });

    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json().user.email).toBe('anna@example.com');
    expect(me.headers['cache-control']).toBe('private, no-store');

    const logout = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(204);
    const after = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.json().user).toBeNull();
  });

  it('gives configured admin emails the admin role', async () => {
    const { user } = await register(ctx, 'admin@example.com');
    expect(user.role).toBe('admin');
  });

  it('rejects a duplicate email and a wrong password', async () => {
    await register(ctx, 'bob@example.com');
    const duplicate = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'bob@example.com', password: 'another long password', displayName: 'Bob' },
    });
    expect(duplicate.statusCode).toBe(409);

    const wrong = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'bob@example.com', password: 'wrong password' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error).toBe('invalid_credentials');

    const ok = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'BOB@example.com', password: 'correct horse battery' },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('validates input', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'not-an-email', password: 'short', displayName: 'X' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('validation');
  });

  it('blocks state changes from foreign origins', async () => {
    const foreign = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'x@example.com', password: 'whatever' },
    });
    expect(foreign.statusCode).toBe(403);

    const subdomain = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://water.is.gratis' },
      payload: { email: 'x@example.com', password: 'whatever' },
    });
    expect(subdomain.statusCode).toBe(401);
  });
});

describe('roles', () => {
  it('lets admins make someone a moderator, but not change their own role', async () => {
    const admin = await register(ctx, 'admin@example.com');
    const anna = await register(ctx, 'anna-role@example.com', 'Anna');
    const list = await ctx.app.inject({ url: '/api/admin/users?q=anna', headers: { cookie: admin.cookie } });
    expect(list.json().users).toEqual([expect.objectContaining({ email: 'anna-role@example.com', role: 'user' })]);
    const changed = await ctx.app.inject({ method: 'POST', url: `/api/admin/users/${anna.user.id}/role`, headers: { cookie: admin.cookie }, payload: { role: 'moderator' } });
    expect(changed.json()).toEqual({ role: 'moderator' });
    const self = await ctx.app.inject({ method: 'POST', url: `/api/admin/users/${admin.user.id}/role`, headers: { cookie: admin.cookie }, payload: { role: 'user' } });
    expect(self.statusCode).toBe(400);
    expect((await ctx.app.inject({ url: '/api/admin/users', headers: { cookie: anna.cookie } })).statusCode).toBe(403);
  });
});
