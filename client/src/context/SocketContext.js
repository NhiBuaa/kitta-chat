import { createContext, useContext } from "react";
export const SocketContext = createContext();

// Export Hook
export const useSocket = () => {
    return useContext(SocketContext);
};