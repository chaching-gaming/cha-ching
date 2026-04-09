import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';
import { useAuth } from '@/providers/auth';

type Profile = Database['public']['Tables']['profiles']['Row'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

const PROFILE_KEY = ['profile'] as const;

export function useProfile() {
  const { session } = useAuth();

  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session!.user.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!session?.user.id,
  });
}

export function useUpdateProfile() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { display_name?: string; avatar_url?: string }) => {
      if (!session?.user.id) throw new Error('Not authenticated');

      const updateData: ProfileUpdate = {};
      if (params.display_name !== undefined) updateData.display_name = params.display_name;
      if (params.avatar_url !== undefined) updateData.avatar_url = params.avatar_url;

      const { data, error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', session.user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}
