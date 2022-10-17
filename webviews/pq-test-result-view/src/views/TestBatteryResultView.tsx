/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import React, { useMemo } from "react";

import { MessageBarType } from "@fluentui/react/lib/MessageBar";
import { Pivot, PivotItem } from "@fluentui/react/lib/Pivot";

import { CloseableMessageBoxComp } from "../components/MessageBoxComp";

import { TestBatteryGeneralGrid } from "../components/TestBatteryGeneralGrid";
import { useI18n } from "../i18n";
import { flattenJSON } from "../utils/jsons";

interface TestBatteryResult {
    testRunExecution: any;
}

interface GeneralDetailItem {
    Item: string;
    Value: any;
}

export const TestBatteryResultView: React.FC<TestBatteryResult> = React.memo<TestBatteryResult>(props => {
    const { testRunExecution } = props;

    const OutputLabel = useI18n("testBatteryResView.Table.Output.Title");
    const SummaryLabel = useI18n("testBatteryResView.Table.Output.Summary");
    const DataSourceLabel = useI18n("testBatteryResView.Table.Output.DataSource");
    const ErrorLabel = useI18n("common.error.label");

    const hasOutput = useMemo(
        () => Array.isArray(testRunExecution.Output) && testRunExecution.Output.length,
        [testRunExecution],
    );

    const errorDetailsString = useMemo<string | null>(() => {
        if (testRunExecution.Status !== "Passed" && testRunExecution.Status !== 3) {
            if (testRunExecution.Error?.Message && typeof testRunExecution.Error?.Message === "string") {
                return testRunExecution.Error?.Message;
            }
            if (testRunExecution.Details && typeof testRunExecution.Details === "string") {
                return testRunExecution.Details;
            }
        }
        return null;
    }, [testRunExecution]);

    const hasDataSource = useMemo(
        () => Array.isArray(testRunExecution.DataSourceAnalysis) && testRunExecution.DataSourceAnalysis.length,
        [testRunExecution],
    );

    const summaryArr = useMemo(() => {
        const result: GeneralDetailItem[] = [];
        ["ActivityId", "Method", "Name", "Status", "Type"].forEach(key => {
            if (testRunExecution[key]) {
                result.push({
                    Item: key,
                    Value: testRunExecution[key],
                });
            }
        });

        const startTime: Date = addFormattedDate(testRunExecution, "StartTime", result);
        const endTime: Date = addFormattedDate(testRunExecution, "EndTime", result);
        const duration = new Date(endTime.valueOf() - startTime.valueOf());

        result.push({
            Item: "Duration",
            Value: duration.toISOString().substring(11, 23), // display HH:mm:ss.sss
        });

        return result;
    }, [testRunExecution]);

    const dataSourceArr = useMemo(() => {
        const result: GeneralDetailItem[] = [];
        if (hasDataSource) {
            const theFlattenDataSource = flattenJSON(testRunExecution.DataSourceAnalysis[0]);
            Object.keys(theFlattenDataSource).forEach(key => {
                result.push({
                    Item: key,
                    Value: theFlattenDataSource[key],
                });
            });
        }

        return result;
    }, [testRunExecution, hasDataSource]);

    const mashupErrorArr = useMemo(() => {
        const result: GeneralDetailItem[] = [];
        const theFlattenError = flattenJSON(testRunExecution.Error);
        Object.keys(theFlattenError).forEach(key => {
            result.push({
                Item: key,
                Value: theFlattenError[key],
            });
        });

        return result;
    }, [testRunExecution.Error]);

    return (
        <>
            {errorDetailsString ? (
                <CloseableMessageBoxComp
                    key={new Date().getTime()}
                    messageBarType={MessageBarType.error}
                    isMultiline={true}
                >
                    {errorDetailsString}
                </CloseableMessageBoxComp>
            ) : null}
            <Pivot aria-label="PQTest battery test result" defaultSelectedKey={hasOutput ? "Output" : "Summary"}>
                {hasOutput ? (
                    <PivotItem key="output" headerText={OutputLabel}>
                        <TestBatteryGeneralGrid items={testRunExecution.Output} />
                    </PivotItem>
                ) : null}
                <PivotItem key="summary" headerText={SummaryLabel}>
                    <TestBatteryGeneralGrid items={summaryArr} />
                </PivotItem>
                {hasDataSource ? (
                    <PivotItem key="dataSource" headerText={DataSourceLabel}>
                        <TestBatteryGeneralGrid items={dataSourceArr} />
                    </PivotItem>
                ) : null}

                {mashupErrorArr.length ? (
                    <PivotItem key="mashupError" headerText={ErrorLabel}>
                        <TestBatteryGeneralGrid items={mashupErrorArr} />
                    </PivotItem>
                ) : null}
            </Pivot>
        </>
    );
});

function addFormattedDate(testRunExecution: any, dateKey: string, items: GeneralDetailItem[]): Date {
    const theDate: Date = new Date(testRunExecution[dateKey]);
    items.push({
        Item: dateKey,
        Value: `${theDate.toLocaleDateString()} ${theDate.toLocaleTimeString()}`,
    });

    return theDate;
}
