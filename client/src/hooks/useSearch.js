import { useState, useEffect } from "react";
import { searchUsers } from "@/services/api/userApi.js";

/**
 * Tìm kiếm user theo keyword (debounce 500ms).
 * searchResult và setSearchResult được nhận từ ngoài vào
 * để Home có thể dùng setSearchResult trong patchUserEverywhere.
 *
 * @param {object} deps
 * @param {Array}    deps.users          - friend list (fallback khi không tìm kiếm)
 * @param {Array}    deps.searchResult   - state từ Home
 * @param {Function} deps.setSearchResult
 */
export const useSearch = ({ users, searchResult, setSearchResult }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (!searchTerm.trim()) {
            setSearchResult([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await searchUsers(searchTerm);
                if (res.data.success) setSearchResult(res.data.users);
            } catch (error) {
                console.error("[useSearch] error:", error);
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchTerm, setSearchResult]);

    const isSearchingMode = searchTerm.trim() !== "";
    const usersToDisplay = isSearchingMode ? searchResult : users;

    return { searchTerm, setSearchTerm, isSearching, usersToDisplay };
};
