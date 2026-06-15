import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { KeyboardAwareScrollView } from '@/components/form/keyboard-aware-scroll-view';
import { useForm } from '@/hooks/use-form';
import { useToast } from '@/providers/toast';
import { useAuth } from '@/providers/auth';

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export default function ResetPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session, clearPasswordRecovery } = useAuth();

  const form = useForm({
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
    validators: {
      onSubmit: resetPasswordSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      // Verify session exists before attempting password update
      if (!session) {
        formApi.setErrorMap({
          onSubmit: {
            fields: {},
            form: 'Session expired. Please request a new password reset link.',
          },
        });
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: value.password,
      });

      if (error) {
        formApi.setErrorMap({
          onSubmit: {
            fields: {},
            form: error.message,
          },
        });
      } else {
        // Clear recovery state and sign out to ensure clean state
        clearPasswordRecovery();
        await supabase.auth.signOut();
        toast.show({ type: 'success', message: 'Password updated successfully. Please sign in.' });
        router.replace('/(auth)/sign-in');
      }
    },
  });

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerClassName="flex-grow justify-center px-5 py-8"
    >
      <View className="mb-8">
        <Text className="text-3xl font-bold text-text-primary">Reset Password</Text>
        <Text className="mt-2 text-base text-text-secondary">Enter your new password below.</Text>
      </View>

      <form.AppForm>
        <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
          {(formError) =>
            formError ? (
              <View className="mb-4 items-center rounded-xl bg-error/10 px-4 py-3">
                <Text className="text-center text-base text-error">
                  {typeof formError === 'string' ? formError : 'An error occurred'}
                </Text>
              </View>
            ) : null
          }
        </form.Subscribe>

        <form.AppField name="password">
          {(field) => (
            <field.TextField
              label="New Password"
              placeholder="********"
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
            />
          )}
        </form.AppField>

        <form.AppField name="confirmPassword">
          {(field) => (
            <field.TextField
              label="Confirm Password"
              placeholder="********"
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
            />
          )}
        </form.AppField>

        <form.SubmitButton className="mt-2">Update Password</form.SubmitButton>
      </form.AppForm>
    </KeyboardAwareScrollView>
  );
}
