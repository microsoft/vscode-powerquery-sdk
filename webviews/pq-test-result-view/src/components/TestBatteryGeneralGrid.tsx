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
