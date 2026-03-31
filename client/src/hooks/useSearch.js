import { useState, useEffect } from "react";
import axios from "axios";

/**
 * Tìm kiếm user theo keyword (debounce 500ms).
 * searchResult và setSearchResult được nhận từ ngoài vào
 * để Home có thể dùng setSearchResult trong patchUserEverywhere.
 *
 * @param {object} deps
 * @param {string}   deps.API_URL
 * @param {Array}    deps.users          - friend list (fallback khi không tìm kiếm)
 * @param {Array}    deps.searchResult   - state từ Home
 * @param {Function} deps.setSearchResult
 */
export const useSearch = ({ API_URL, users, searchResult, setSearchResult }) => {
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
                const token = localStorage.getItem("token");
                const res = await axios.get(
                    `${API_URL}/api/users/search?keyword=${encodeURIComponent(searchTerm)}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (res.data.success) setSearchResult(res.data.users);
            } catch (error) {
                console.error("[useSearch] error:", error);
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchTerm, API_URL, setSearchResult]);

    const isSearchingMode = searchTerm.trim() !== "";
    const usersToDisplay = isSearchingMode ? searchResult : users;

    return { searchTerm, setSearchTerm, isSearching, usersToDisplay };
};