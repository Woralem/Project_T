import { useState, useCallback } from 'react';
import type { UserDto } from '../types';
import * as api from '../api';

export function useUsers() {
    const [users, setUsers] = useState<UserDto[]>([]);
    const [loading, setLoading] = useState(false);

    const search = useCallback(async (query?: string) => {
        setLoading(true);
        try {
            const result = await api.searchUsers(query);
            setUsers(result);
        } catch (e) {
            console.error('Failed to search users', e);
        } finally {
            setLoading(false);
        }
    }, []);

    return { users, loading, search };
}