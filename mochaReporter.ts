/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as Mocha from "mocha";

export = class MultiReporter {
    public constructor(runner: Mocha.Runner, options: Mocha.MochaOptions) {
        new Mocha.reporters.Spec(runner, options);
        new Mocha.reporters.XUnit(runner, options);
    }
};
