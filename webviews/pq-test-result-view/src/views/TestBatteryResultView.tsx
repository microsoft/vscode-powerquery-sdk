import React, { useMemo } from "react";
import { Pivot, PivotItem } from "@fluentui/react/lib/Pivot";

import { TestBatteryGeneralGrid } from "../components/TestBatteryGeneralGrid";
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

    const hasOutput = useMemo(
        () => Array.isArray(testRunExecution.Output) && testRunExecution.Output.length,
        [testRunExecution],
    );
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

        ["StartTime", "EndTime"].forEach(key => {
            if (testRunExecution[key]) {
                const theDate = new Date(testRunExecution[key]);
                result.push({
                    Item: key,
                    Value: `${theDate.toLocaleDateString()} ${theDate.toLocaleTimeString()}`,
                });
            }
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

    return (
        <>
            <Pivot aria-label="PQTest battery test result" defaultSelectedKey={hasOutput ? "Output" : "Summary"}>
                {hasOutput ? (
                    <PivotItem key="output" headerText="Output">
                        <TestBatteryGeneralGrid items={testRunExecution.Output} />
                    </PivotItem>
                ) : null}
                <PivotItem key="Details" headerText="Summary">
                    <TestBatteryGeneralGrid items={summaryArr} />
                </PivotItem>
                {hasDataSource ? (
                    <PivotItem key="dataSource" headerText="DataSource">
                        <TestBatteryGeneralGrid items={dataSourceArr} />
                    </PivotItem>
                ) : null}
            </Pivot>
        </>
    );
});
