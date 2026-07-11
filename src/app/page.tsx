import { redirect } from 'next/navigation'

export default function RootPage() {
  // Pega quem acessa localhost:3000 e empurra para a rota com a Sidebar
  redirect('/dashboard')
}