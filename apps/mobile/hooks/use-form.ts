import { createFormHook } from '@tanstack/react-form';
import { fieldContext, formContext } from './form-context';
import { SubmitButton } from '@/components/form/submit-button';
import { TextField } from '@/components/form/text-field';

export const { useAppForm: useForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
  },
  formComponents: {
    SubmitButton,
  },
});
