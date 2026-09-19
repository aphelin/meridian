"use client";

import { AccountShell } from "./AccountShell";
import { AddressesView } from "./AddressesView";
import { Overview } from "./Overview";
import { ProfileView } from "./ProfileView";

/** Client entry points for the signed-in account routes (render props can't cross the server boundary). */

export function AccountOverviewPage({ next }: { next: string | null }) {
  return (
    <AccountShell section="overview" next={next}>
      {(user) => <Overview user={user} />}
    </AccountShell>
  );
}

export function AccountProfilePage() {
  return <AccountShell section="profile">{(user) => <ProfileView user={user} />}</AccountShell>;
}

export function AccountAddressesPage() {
  return <AccountShell section="addresses">{() => <AddressesView />}</AccountShell>;
}
