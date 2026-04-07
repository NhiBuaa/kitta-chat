import React, { createContext, useContext } from 'react';

export const CallHistoryContext = createContext();

export const useCallHistory = () => {
    const context = useContext(CallHistoryContext);
    if (!context) {
        throw new Error("useCallHistory must be used within a CallHistoryProvider");
    }
    return context;
}
