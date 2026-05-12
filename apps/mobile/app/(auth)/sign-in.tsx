import { useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, type Href } from 'expo-router';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle, signInWithApple } from '@/lib/oauth';
import { KeyboardAwareScrollView } from '@/components/form/keyboard-aware-scroll-view';
import { useForm } from '@/hooks/use-form';
import { useToast } from '@/providers/toast';

const signInSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function SignInScreen() {
  const [oauthLoading, setOauthLoading] = useState(false);
  const toast = useToast();

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onChange: signInSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: value.email,
        password: value.password,
      });
      if (error) {
        formApi.setErrorMap({
          onSubmit: {
            fields: {},
            form: error.message,
          },
        });
      }
    },
  });

  async function handleOAuth(provider: 'google' | 'apple') {
    try {
      setOauthLoading(true);
      console.log(`[SignIn] Starting ${provider} OAuth...`);
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithApple();
      }
      console.log(`[SignIn] ${provider} OAuth success`);
    } catch (error) {
      console.error(`[SignIn] ${provider} OAuth error:`, error);
      const message = error instanceof Error ? error.message : 'OAuth sign-in failed';
      toast.show({ type: 'error', message });
    } finally {
      setOauthLoading(false);
    }
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerClassName="flex-grow justify-center px-5 py-8"
    >
      <View className="mb-8 items-center">
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../../assets/images/cha-ching-logo.png')}
          className="mb-4 h-24 w-24"
          resizeMode="contain"
        />
        <Text className="text-3xl font-bold text-white">Cha-Ching</Text>
        <Text className="mt-2 text-base text-text-secondary">Social Prop Bets with Friends</Text>
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

        <form.AppField name="password">
          {(field) => (
            <field.TextField
              label="Password"
              labelRight={
                <Link href={'/(auth)/forgot-password' as Href} asChild>
                  <TouchableOpacity>
                    <Text className="text-sm font-medium text-primary">Forgot Password?</Text>
                  </TouchableOpacity>
                </Link>
              }
              placeholder="********"
              secureTextEntry
              textContentType="password"
              autoComplete="password"
            />
          )}
        </form.AppField>

        <form.SubmitButton className="mt-2">Log In</form.SubmitButton>
      </form.AppForm>

      <View className="my-6 flex-row items-center">
        <View className="h-px flex-1 bg-border" />
        <Text className="mx-4 text-sm text-text-muted">or continue with</Text>
        <View className="h-px flex-1 bg-border" />
      </View>

      <View className="flex-row gap-3">
        <TouchableOpacity
          className="min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-light px-4 py-3"
          onPress={() => handleOAuth('apple')}
          disabled={oauthLoading}
          activeOpacity={0.7}
        >
          <FontAwesome name="apple" size={18} color="#fff" />
          <Text className="text-base font-medium text-white">Apple</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-light px-4 py-3"
          onPress={() => handleOAuth('google')}
          disabled={oauthLoading}
          activeOpacity={0.7}
        >
          <FontAwesome name="google" size={18} color="#fff" />
          <Text className="text-base font-medium text-white">Google</Text>
        </TouchableOpacity>
      </View>

      <Link href="/(auth)/sign-up" replace asChild>
        <TouchableOpacity className="mt-6 min-h-[44px] items-center justify-center">
          <Text className="text-sm text-text-secondary">
            {"Don't have an account? "}
            <Text className="font-semibold text-primary">Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </Link>
    </KeyboardAwareScrollView>
  );
}
