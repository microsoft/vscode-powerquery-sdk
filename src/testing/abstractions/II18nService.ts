/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

/**
 * Abstraction for internationalization functions to enable testing
 */
export interface II18nService {
    /**
     * Get localized string by key
     */
    getString(key: string): string;

    /**
     * Resolve template with substituted values
     */
    resolveTemplate(template: string, values: Record<string, unknown>): string;
}
