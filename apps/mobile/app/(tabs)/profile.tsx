import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useProfile, useUpdateProfile } from '@/hooks/use-profile';
import { useAuth } from '@/providers/auth';
import { uploadAvatar } from '@/lib/storage';

export default function ProfileScreen() {
  const { session } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);

  function startEditing() {
    setDisplayName(profile?.display_name ?? '');
    setIsEditing(true);
  }

  async function handleSave() {
    try {
      await updateProfile.mutateAsync({ display_name: displayName });
      setIsEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      Alert.alert('Error', message);
    }
  }

  async function handlePickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;
    if (!session?.user.id) return;

    try {
      setUploading(true);
      const publicUrl = await uploadAvatar(session.user.id, result.assets[0].uri);
      await updateProfile.mutateAsync({ avatar_url: publicUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload avatar';
      Alert.alert('Error', message);
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.avatarContainer}
        onPress={handlePickAvatar}
        disabled={uploading}
      >
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <FontAwesome name="user" size={40} color="#999" />
          </View>
        )}
        {uploading ? (
          <View style={styles.avatarOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <View style={styles.avatarBadge}>
            <FontAwesome name="camera" size={12} color="#fff" />
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.email}>{profile?.email ?? session?.user.email}</Text>

      {isEditing ? (
        <View style={styles.editRow}>
          <TextInput
            style={styles.editInput}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display Name"
            autoFocus
          />
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            disabled={updateProfile.isPending}
          >
            <Text style={styles.saveButtonText}>
              {updateProfile.isPending ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsEditing(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.nameRow} onPress={startEditing}>
          <Text style={styles.displayName}>{profile?.display_name ?? 'Set your name'}</Text>
          <FontAwesome name="pencil" size={16} color="#888" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#2563eb',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  email: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '600',
  },
  editRow: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  editInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelText: {
    color: '#888',
    fontSize: 14,
  },
});
