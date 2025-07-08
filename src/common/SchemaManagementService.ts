/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { ExtensionConstants } from "../constants/PowerQuerySdkExtension";
import { PqSdkOutputChannel } from "../features/PqSdkOutputChannel";

/**
 * Service responsible for managing JSON schema files from the NuGet package
 */
export class SchemaManagementService {
    private readonly extensionPath: string;
    private readonly schemasFolderPath: string;
    private readonly userSettingsSchemaFileName: string = "UserSettings.schema.json";

    constructor(
        vscExtCtx: vscode.ExtensionContext,
        private readonly outputChannel?: PqSdkOutputChannel,
    ) {
        this.extensionPath = vscExtCtx.extensionPath;
        this.schemasFolderPath = path.resolve(this.extensionPath, "schemas");
    }

    /**
     * Copies the UserSettings.schema.json file from the NuGet package to the extension's schemas folder
     * @param nugetPackageVersion The version of the NuGet package to copy from
     */
    public copyUserSettingsSchemaFromNugetPackage(nugetPackageVersion: string): void {
        try {
            const nugetPackagePath: string = this.getNugetPackagePath(nugetPackageVersion);
            const sourceSchemaPath: string = path.join(nugetPackagePath, "content", this.userSettingsSchemaFileName);
            const targetSchemaPath: string = path.join(this.schemasFolderPath, this.userSettingsSchemaFileName);

            // Check if source schema file exists
            if (!fs.existsSync(sourceSchemaPath)) {
                this.outputChannel?.appendLine(
                    `Warning: UserSettings.schema.json not found in NuGet package at: ${sourceSchemaPath}`,
                );

                return;
            }

            // Ensure schemas directory exists
            if (!fs.existsSync(this.schemasFolderPath)) {
                fs.mkdirSync(this.schemasFolderPath, { recursive: true });
            }

            // Copy the schema file
            fs.copyFileSync(sourceSchemaPath, targetSchemaPath);

            this.outputChannel?.appendLine(
                `Successfully copied UserSettings.schema.json from NuGet package version ${nugetPackageVersion}`,
            );
        } catch (error) {
            this.outputChannel?.appendLine(
                `Error: Failed to copy UserSettings.schema.json: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    /**
     * Checks if the UserSettings.schema.json file exists in the extension's schemas folder
     */
    public userSettingsSchemaExists(): boolean {
        const schemaPath: string = path.join(this.schemasFolderPath, this.userSettingsSchemaFileName);

        return fs.existsSync(schemaPath);
    }

    /**
     * Gets the path to the NuGet package directory for a given version
     */
    private getNugetPackagePath(version: string): string {
        const baseNugetFolder: string = path.resolve(this.extensionPath, ExtensionConstants.NugetBaseFolder);

        return path.join(baseNugetFolder, `${ExtensionConstants.InternalMsftPqSdkToolsNugetName}.${version}`);
    }

    /**
     * Removes the UserSettings.schema.json file from the extension's schemas folder
     */
    public removeUserSettingsSchema(): void {
        try {
            const schemaPath: string = path.join(this.schemasFolderPath, this.userSettingsSchemaFileName);

            if (fs.existsSync(schemaPath)) {
                fs.unlinkSync(schemaPath);
                this.outputChannel?.appendLine("Removed UserSettings.schema.json from schemas folder");
            }
        } catch (error) {
            this.outputChannel?.appendLine(
                `Error: Failed to remove UserSettings.schema.json: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }
}
