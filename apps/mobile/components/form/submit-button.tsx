import { useFormContext } from '@/hooks/form-context';
import { Button } from '@/components/ui';

interface SubmitButtonProps {
  children: string;
  className?: string;
}

export function SubmitButton({ children, className }: SubmitButtonProps) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
      {([canSubmit, isSubmitting]) => (
        <Button
          onPress={form.handleSubmit}
          disabled={!canSubmit}
          loading={isSubmitting}
          className={className}
        >
          {children}
        </Button>
      )}
    </form.Subscribe>
  );
}
