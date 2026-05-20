import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useNotifications(userId: string | undefined) {
  const q = useQuery({
    queryKey: ["notifications", userId],
    enabled: Boolean(userId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const res = await api.api.v1.notifications.$get();
      if (!res.ok) return { notifications: [], unread_count: 0 };
      return res.json();
    },
  });
  return {
    notifications: q.data?.notifications ?? [],
    unreadCount: q.data?.unread_count ?? 0,
  };
}
