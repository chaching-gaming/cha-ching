# Past Rooms Implementation Plan

Show rooms the user left, was removed from, or that were closed by admin in Past Rooms.

## Client Requirements Summary

1. **Rejoin**: Users can rejoin rooms (left or removed)
2. **Balance**: Continue from where they left (preserve chip balance)
3. **Active Bets**: Block leaving if user has active bets
4. **Chips**: Frozen when leaving (preserved for rejoin)
5. **Privacy**: Removed users only see bets they participated in
6. **Status Display**: Show left vs removed status

---

## Implementation Steps

### 1. Database Migration: Schema Changes

**File**: `supabase/migrations/20260530000000_soft_delete_room_members_v2.sql`

Add columns to `room_members`:

```sql
ALTER TABLE public.room_members
  ADD COLUMN left_at timestamptz DEFAULT NULL,
  ADD COLUMN left_reason text DEFAULT NULL
    CHECK (left_reason IN ('VOLUNTARY', 'REMOVED', 'ROOM_CLOSED'));

-- Indexes for performance
CREATE INDEX idx_room_members_left_at ON public.room_members(room_id, left_at);
CREATE INDEX idx_room_members_user_left ON public.room_members(user_id, left_at) WHERE left_at IS NOT NULL;
```

### 2. Database Migration: Helper Functions

**File**: `supabase/migrations/20260530000000_soft_delete_room_members_v2.sql`

```sql
-- Update is_room_member to check only active members
CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id AND user_id = auth.uid() AND left_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- New: Check if user was EVER a member (for read access)
CREATE OR REPLACE FUNCTION public.is_room_member_ever(p_room_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- New: Check for active bets (blocks leaving)
CREATE OR REPLACE FUNCTION public.has_active_bets_in_room(p_room_id uuid, p_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.bet_stakes bs
    JOIN public.bets b ON bs.bet_id = b.id
    WHERE bs.user_id = p_user_id
      AND b.room_id = p_room_id
      AND b.status IN ('OPEN', 'MATCHED', 'PENDING_RESULT', 'PENDING_DISPUTE', 'DISPUTED')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 3. Database Migration: Update RPCs

**File**: `supabase/migrations/20260530000001_update_membership_rpcs.sql`

#### Update `leave_room`:

- Check `has_active_bets_in_room()` → raise error P0009 if active bets exist
- Soft delete: `UPDATE SET left_at = now(), left_reason = 'VOLUNTARY'`

#### Update `remove_member`:

- Admin CAN remove members with active bets (authority)
- Soft delete: `UPDATE SET left_at = now(), left_reason = 'REMOVED'`

#### Update `join_room_via_invite`:

- Check for existing membership (including soft-deleted)
- If `left_at IS NOT NULL`: reactivate by setting `left_at = NULL, left_reason = NULL, role = 'PLAYER'`
- No new chips granted (existing GRANT ledger entry preserved)

#### Update `update_member_role` and `reassign_admin`:

- Add `AND left_at IS NULL` checks for active membership

### 4. Database Migration: RLS Policy Updates

**File**: `supabase/migrations/20260530000002_update_rls_policies.sql`

| Table           | Policy           | Change                                                              |
| --------------- | ---------------- | ------------------------------------------------------------------- |
| `rooms`         | Members can view | Use `is_room_member_ever()` for read access                         |
| `room_members`  | View members     | Active members see all; inactive see only themselves                |
| `bets`          | View bets        | Active members see all; inactive see only bets they participated in |
| `bet_stakes`    | View stakes      | Match bets visibility logic                                         |
| `chip_requests` | View requests    | Active see all; inactive see only their own                         |

### 5. Frontend: Update Types

**File**: `packages/types/src/database.ts`

Regenerate types after migration. New fields on `room_members`:

- `left_at: string | null`
- `left_reason: 'VOLUNTARY' | 'REMOVED' | 'ROOM_CLOSED' | null`

### 6. Frontend: Update `useRooms` Hook

**File**: `apps/mobile/hooks/use-rooms.ts`

- Add `membershipStatus`, `leftAt`, `leftReason` to `RoomWithMembership` type
- For `history` filter: fetch memberships where `left_at IS NOT NULL`
- Member count query: add `.is('left_at', null)` to count only active members
- Derive `membershipStatus` from `left_reason`

### 7. Frontend: Update `useRoomMembers` Hook

**File**: `apps/mobile/hooks/use-rooms.ts`

- Add `.is('left_at', null)` to only show active members

### 8. Frontend: Update Realtime Subscriptions

**File**: `apps/mobile/hooks/use-rooms.ts`

- Change `room_members` listener from `DELETE` to `UPDATE` event
- Check if `left_at` was set (soft-delete)

### 9. Frontend: Update Profile Screen UI

**File**: `apps/mobile/app/(tabs)/profile.tsx`

- Show status text for past rooms: "You left", "Removed by admin", "Session ended"
- Add "Rejoin" button for rooms where `is_active = true` and user has left

### 10. Frontend: Handle Leave Error

**File**: `apps/mobile/hooks/use-rooms.ts` or settings screen

- Handle error code `P0009` with message: "You have active bets that need to settle before you can leave."

---

## Key Files to Modify

| File                                                                 | Changes                    |
| -------------------------------------------------------------------- | -------------------------- |
| `supabase/migrations/20260530000000_soft_delete_room_members_v2.sql` | New - schema + helpers     |
| `supabase/migrations/20260530000001_update_membership_rpcs.sql`      | New - RPC updates          |
| `supabase/migrations/20260530000002_update_rls_policies.sql`         | New - policy updates       |
| `apps/mobile/hooks/use-rooms.ts`                                     | Update queries and types   |
| `apps/mobile/app/(tabs)/profile.tsx`                                 | Update UI for past rooms   |
| `packages/types/src/database.ts`                                     | Regenerate after migration |

---

## Edge Cases Handled

| Case                           | Solution                                                    |
| ------------------------------ | ----------------------------------------------------------- |
| Rejoin preserves balance       | Ledger entries intact; `GRANT` has `ON CONFLICT DO NOTHING` |
| Active bets block leaving      | `has_active_bets_in_room()` check in `leave_room`           |
| Admin removes member with bets | Allowed (admin authority)                                   |
| Room deleted (auto-prune)      | Cascade delete removes membership history (acceptable)      |
| Privacy for removed users      | RLS allows viewing only their own bets                      |

---

## Verification Steps

1. **Leave room (no bets)**: User can leave, appears in Past Rooms as "You left"
2. **Leave room (with bets)**: Error message shown, cannot leave
3. **Admin removes member**: Member appears in Past Rooms as "Removed by admin"
4. **Rejoin via invite code**: Balance preserved, no new chips granted
5. **Past rooms privacy**: Removed user sees only their own bets
6. **Member count**: Shows only active members
7. **Realtime updates**: Soft-delete triggers history list refresh
