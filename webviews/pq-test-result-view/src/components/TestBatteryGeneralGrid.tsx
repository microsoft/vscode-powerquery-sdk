/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import React from "react";
import { DetailsList, DetailsListLayoutMode, SelectionMode } from "@fluentui/react/lib/DetailsList";

interface TestBatteryOutputGridProps {
    items: any[];
}

export const TestBatteryGeneralGrid: React.FC<TestBatteryOutputGridProps> = React.memo(props => {
    const { items } = props;

    return (
        <DetailsList
            compact={true}
            selectionMode={SelectionMode.none}
            layoutMode={DetailsListLayoutMode.justified}
            items={items}
        />
    );
});
