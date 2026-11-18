import DemoApp from './DemoApp'
import PlatformApp from './PlatformApp'
import { configured } from './lib/supabase'

// Keep the existing PDF demo until Supabase URL and publishable key are configured.
export default function App() {
  return configured ? <PlatformApp /> : <DemoApp />
}
