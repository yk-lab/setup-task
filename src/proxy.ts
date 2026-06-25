import * as core from '@actions/core';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

/**
 * Route the action's `fetch()` calls through the runner's proxy when one is
 * configured. Node's built-in fetch ignores `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`
 * by default; `EnvHttpProxyAgent` reads them (including `NO_PROXY`), and
 * `setGlobalDispatcher` makes the built-in fetch use it. Without this, version
 * resolution and checksum fetches fail on proxied/self-hosted runners (#54).
 *
 * No-op when no proxy is set, so direct-egress runners are unchanged.
 */
export function configureProxyFromEnv(): void {
  // `||` (not `??`) so an empty var (HTTP_PROXY="", a common "unset") doesn't
  // shadow a real proxy set in a later variable.
  const proxy =
    process.env.HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.https_proxy;
  if (!proxy) {
    return;
  }
  setGlobalDispatcher(new EnvHttpProxyAgent());
  core.info('Detected a proxy in the environment; routing requests through it.');
}
