import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useStats() {
  return useQuery({
    queryKey: [api.stats.get.path],
    queryFn: async () => {
      const res = await fetch(api.stats.get.path);
      if (!res.ok) throw new Error("Failed to fetch statistics");
      return api.stats.get.responses[200].parse(await res.json());
    },
    refetchInterval: 5000, // Poll every 5 seconds for live updates
  });
}
