import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';
import { useAuth } from '@/providers/auth';

export type QuestionTemplate = Database['public']['Tables']['question_templates']['Row'];

const questionTemplatesKey = (category: string) => ['question_templates', category] as const;

export function useQuestionTemplates(category = 'golf') {
  const { session } = useAuth();

  return useQuery({
    queryKey: questionTemplatesKey(category),
    queryFn: async (): Promise<QuestionTemplate[]> => {
      const { data, error } = await supabase.rpc('list_question_templates', {
        p_category: category,
      });
      if (error) throw error;
      return (data ?? []) as QuestionTemplate[];
    },
    enabled: !!session?.user.id,
  });
}
