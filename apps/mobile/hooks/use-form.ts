import { createFormHook } from '@tanstack/react-form';
import { fieldContext, formContext } from './form-context';
import { OptionField } from '@/components/form/option-field';
import { SubmitButton } from '@/components/form/submit-button';
import { TextField } from '@/components/form/text-field';

export const { useAppForm: useForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    OptionField,
    TextField,
  },
  formComponents: {
    SubmitButton,
  },
});
