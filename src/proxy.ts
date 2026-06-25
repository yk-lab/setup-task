import * as core from '@actions/core';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { errorMessage } from './errors';

/**
 * Route the action's `fetch()` through the runner's proxy when one is set.
 * Node's built-in fetch ignores `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`; undici's
 * `EnvHttpProxyAgent` reads them and `setGlobalDispatcher` applies it to fetch.
 * No-op without a proxy, so direct-egress runners are unchanged (#54).
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
  try {
    // EnvHttpProxyAgent's constructor throws on a malformed proxy URL; surface a
    // clear, actionable error instead of a raw "Invalid URL".
    setGlobalDispatcher(new EnvHttpProxyAgent());
  } catch (err) {
    throw new Error(`Invalid proxy URL in the environment ("${proxy}"): ${errorMessage(err)}`, {
      cause: err,
    });
  }
  core.info('Detected a proxy in the environment; routing requests through it.');
}
