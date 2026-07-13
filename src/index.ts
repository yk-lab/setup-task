import * as core from '@actions/core';
import { errorMessage } from './errors';
import { run } from './main';

// Action entry point. Kept separate from main.ts so run()/writeFailureSummary
// can be imported by unit tests without triggering the pipeline on import.
run().catch((err: unknown) => {
  core.setFailed(errorMessage(err));
});
