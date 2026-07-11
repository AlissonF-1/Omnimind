'use server'

export async function searchYoutubeExplanation(query: string) {
  const API_KEY = process.env.YOUTUBE_API_KEY;
  if (!API_KEY) return { error: 'Chave de API do YouTube não configurada. Adicione YOUTUBE_API_KEY no seu .env.local' };

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=3&q=${encodeURIComponent(query)}&key=${API_KEY}`
    );
    const data = await response.json();
    
    if (data.error) {
      console.error('Erro na API do YouTube:', data.error);
      return { error: data.error.message };
    }
    
    return { success: true, videos: data.items };
  } catch (error: any) {
    console.error('Erro na busca do YouTube:', error);
    return { error: error.message || 'Falha ao buscar vídeos' };
  }
}