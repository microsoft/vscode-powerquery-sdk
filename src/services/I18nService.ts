/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import type { II18nService } from "../testing/abstractions/II18nService";

/**
 * Test-friendly implementation of II18nService that returns simple strings
 */
export class TestI18nService implements II18nService {
    /**
     * Get localized string by key (returns key for testing)
     */
    getString(key: string): string {
        return key;
    }

    /**
     * Resolve template with substituted values (simple implementation for testing)
     */
    resolveTemplate(template: string, values: Record<string, unknown>): string {
        let result: string = template;

        for (const [key, value] of Object.entries(values)) {
            // Simple replacement using string replace
            result = result.split(`{${key}}`).join(String(value));
        }

        return result;
    }
}
