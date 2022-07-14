/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import React from "react";
import { DetailsList, DetailsListLayoutMode, SelectionMode, ConstrainMode } from "@fluentui/react/lib/DetailsList";
import { mergeStyles } from "@fluentui/react/lib/Styling";

interface TestBatteryOutputGridProps {
    items: any[];
}

const testBatteryGeneralGrid = mergeStyles({
    height: "calc( 100vh - 44px)",
    overflow: "auto",
});

export const TestBatteryGeneralGrid: React.FC<TestBatteryOutputGridProps> = React.memo(props => {
    const { items } = props;

    return (
        <div className={testBatteryGeneralGrid}>
            <DetailsList
                compact={true}
                // viewport={viewPort}
                constrainMode={ConstrainMode.unconstrained}
                selectionMode={SelectionMode.none}
                layoutMode={DetailsListLayoutMode.fixedColumns}
                items={items}
            />
        </div>
    );
});
