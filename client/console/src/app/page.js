import { redirect } from 'next/navigation';

// Root → redirect to login (or to rates if already authenticated,
// but the protected layout handles that check).
export default function RootPage() {
  redirect('/login');
}

