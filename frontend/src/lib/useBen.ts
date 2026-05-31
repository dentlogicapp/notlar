"use client";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "./api";

export function useBen() {
  return useQuery({
    queryKey: ["ben"],
    queryFn: authApi.ben,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
