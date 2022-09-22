/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the MIT license found in the
 * LICENSE file in the root of this projects source tree.
 */

import React, { useState, useCallback } from "react";
import { MessageBar, IMessageBarProps } from "@fluentui/react/lib/MessageBar";
import { useI18n } from "../i18n";

export const CloseableMessageBoxComp: React.FC<IMessageBarProps> = (props: IMessageBarProps) => {
    const { children } = props;

    const OutputLabel = useI18n("common.dismiss.label");

    const [shown, setShown] = useState(true);
    const handleDismiss = useCallback(() => {
        setShown(false);
    }, []);

    return shown ? (
        <MessageBar className="err" {...props} onDismiss={handleDismiss} dismissButtonAriaLabel={OutputLabel}>
            {children}
        </MessageBar>
    ) : null;
};
