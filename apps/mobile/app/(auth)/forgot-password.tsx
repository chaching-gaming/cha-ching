import { Text, TouchableOpacity, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { KeyboardAwareScrollView } from '@/components/form/keyboard-aware-scroll-view';
import { useForm } from '@/hooks/use-form';
import { useToast } from '@/providers/toast';

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
});

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const toast = useToast();

  const form = useForm({
    defaultValues: {
      email: '',
    },
    validators: {
      onSubmit: forgotPasswordSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      const redirectTo = Linking.createURL('/(auth)/reset-password');

      const { error } = await supabase.auth.resetPasswordForEmail(value.email, {
        redirectTo,
      });

      if (error) {
        formApi.setErrorMap({
          onSubmit: {
            fields: {},
            form: error.message,
          },
        });
      } else {
        toast.show({ type: 'success', message: 'Check your email for a password reset link.' });
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
        <Text className="text-3xl font-bold text-text-primary">Forgot Password</Text>
        <Text className="mt-2 text-base text-text-secondary">
          Enter your email and we&apos;ll send you a link to reset your password.
        </Text>
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

        <form.AppField name="email">
          {(field) => (
            <field.TextField
              label="Email"
              placeholder="you@example.com"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
        </form.AppField>

        <form.SubmitButton className="mt-2">Send Reset Link</form.SubmitButton>
      </form.AppForm>

      <Link href="/(auth)/sign-in" replace asChild>
        <TouchableOpacity className="mt-6 min-h-[44px] items-center justify-center">
          <Text className="text-sm text-text-secondary">
            {'Remember your password? '}
            <Text className="font-semibold text-primary">Sign In</Text>
          </Text>
        </TouchableOpacity>
      </Link>
    </KeyboardAwareScrollView>
  );
}
