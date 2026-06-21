'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  osId: number
}

export default function UploadFotos({ osId }: Props) {
  const [uploading, setUploading] = useState(false)

  async function handleUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]

    if (!file) return

    try {
      setUploading(true)

      const nomeArquivo =
        `${osId}/${Date.now()}-${file.name}`

      const { error } = await supabase.storage
        .from('os-fotos')
        .upload(nomeArquivo, file)

      if (error) throw error

      const { data } = supabase.storage
        .from('os-fotos')
        .getPublicUrl(nomeArquivo)

      await supabase
        .from('os_fotos')
        .insert({
          os_id: osId,
          nome_arquivo: file.name,
          url: data.publicUrl,
        })

      alert('Foto enviada com sucesso!')
    } catch (err) {
      console.error(err)
      alert('Erro ao enviar foto')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-xl border border-dashed p-6">
      <label className="block text-sm font-medium mb-2">
        Fotos da OS
      </label>

      <input
        type="file"
        accept="image/*"
        onChange={handleUpload}
      />

      {uploading && (
        <p className="mt-2 text-sm text-slate-500">
          Enviando...
        </p>
      )}
    </div>
  )
}