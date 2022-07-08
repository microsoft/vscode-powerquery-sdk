/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import React from "react";
import { DetailsList, DetailsListLayoutMode, SelectionMode } from "@fluentui/react/lib/DetailsList";
import { mergeStyles } from "@fluentui/react/lib/Styling";

interface TestBatteryOutputGridProps {
    items: any[];
}

const testBatteryGeneralGrid = mergeStyles({
    minHeight: "calc( 100vh - 44px)",
});

export const TestBatteryGeneralGrid: React.FC<TestBatteryOutputGridProps> = React.memo(props => {
    const { items } = props;

    return (
        <DetailsList
            className={testBatteryGeneralGrid}
            compact={true}
            selectionMode={SelectionMode.none}
            layoutMode={DetailsListLayoutMode.fixedColumns}
            items={items}
        />
    );
});
