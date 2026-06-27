import * as core from '@actions/core';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

/**
 * Route the action's `fetch()` through the runner's proxy when one is set.
 * Node's built-in fetch ignores `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`; undici's
 * `EnvHttpProxyAgent` reads them and `setGlobalDispatcher` applies it (picked up
 * by `fetch.ts`, which uses the same undici instance). No-op without a proxy,
 * so direct-egress runners are unchanged (#54).
 */
export function configureProxyFromEnv(): void {
  // First non-empty proxy var. A plain truthiness check (not `??`) so an empty
  // var (HTTP_PROXY="", a common "unset") doesn't shadow a real proxy in a
  // later variable.
  const source = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].find(
    (name) => process.env[name],
  );
  if (!source) {
    return;
  }
  try {
    // EnvHttpProxyAgent's constructor throws on a malformed proxy URL.
    setGlobalDispatcher(new EnvHttpProxyAgent());
  } catch (err) {
    // Name the offending variable, never its value — a proxy URL can embed
    // credentials that must not land in the Actions log.
    throw new Error(`Invalid proxy URL in ${source}.`, { cause: err });
  }
  core.info('Detected a proxy in the environment; routing requests through it.');
}
