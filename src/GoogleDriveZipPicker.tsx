import { useEffect, useRef, useState } from 'react'
import { Cloud, FileArchive } from 'lucide-react'

type GoogleWindow = Window & {
  google?: any
  gapi?: any
}

type DriveZip = {
  id: string
  name: string
  mimeType: string
  size?: string
}

type Props = {
  organizationId: string
}

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY
const PROJECT_NUMBER = import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_NUMBER

function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const isReady = () => {
      const w = window as GoogleWindow

      return id === 'dtm-google-identity'
        ? typeof w.google?.accounts?.oauth2?.initTokenClient === 'function'
        : typeof w.gapi?.load === 'function'
    }

    if (isReady()) {
      resolve()
      return
    }

    const existing = document.getElementById(id) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')

    const finish = (error?: Error) => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
      script.removeEventListener('error', onError)

      if (error) reject(error)
      else resolve()
    }

    const onError = () => finish(
      new Error(`Google script failed to load: ${src}`)
    )

    const interval = window.setInterval(() => {
      if (isReady()) finish()
    }, 100)

    const timeout = window.setTimeout(() => {
      finish(new Error(
        id === 'dtm-google-identity'
          ? 'Google Identity Services did not load. Check browser content blockers.'
          : 'Google Picker API loader did not load. Check browser content blockers.'
      ))
    }, 12000)

    script.addEventListener('error', onError)

    if (!existing) {
      script.id = id
      script.src = src
      script.async = true
      document.head.appendChild(script)
    }
  })
}

export default function GoogleDriveZipPicker({
  organizationId
}: Props) {
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<DriveZip | null>(null)
  const tokenClient = useRef<any>(null)

  useEffect(() => {
    setSelected(null)
    setMessage('')
  }, [organizationId])

  useEffect(() => {
    let active = true

    if (!CLIENT_ID || !API_KEY || !PROJECT_NUMBER) {
      setMessage('Google Drive environment settings are missing.')
      return
    }

    async function initialize() {
      try {
        await Promise.all([
          loadScript(
            'dtm-google-identity',
            'https://accounts.google.com/gsi/client'
          ),
          loadScript(
            'dtm-google-api',
            'https://apis.google.com/js/api.js'
          )
        ])

        if (!active) return

        const googleWindow = window as GoogleWindow

        if (!googleWindow.google?.accounts?.oauth2 ||
            !googleWindow.gapi?.load) {
          throw new Error('Google libraries did not initialize.')
        }

        googleWindow.gapi.load('picker', () => {
          if (!active) return

          tokenClient.current =
            googleWindow.google.accounts.oauth2.initTokenClient({
              client_id: CLIENT_ID,
              scope: SCOPE,
              callback: async (response: any) => {
                if (!active) return

                if (response.error || !response.access_token) {
                  setMessage(
                    response.error_description ||
                    response.error ||
                    'Google authorization failed.'
                  )
                  setBusy(false)
                  return
                }

                const granted =
                  googleWindow.google.accounts.oauth2.hasGrantedAllScopes(
                    response,
                    SCOPE
                  )

                if (!granted) {
                  setMessage('Google Drive permission was not granted.')
                  setBusy(false)
                  return
                }

                try {
                  openPicker(response.access_token)
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : 'Unable to open Google Drive.'
                  )
                  setBusy(false)
                }
              },
              error_callback: (error: any) => {
                if (!active) return
                setMessage(
                  error?.message ||
                  'Google authorization was closed or blocked.'
                )
                setBusy(false)
              }
            })

          setReady(true)
        })
      } catch (error) {
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Google Drive initialization failed.'
          )
        }
      }
    }

    void initialize()

    return () => {
      active = false
    }
  }, [])

  function openPicker(accessToken: string) {
    const google = (window as GoogleWindow).google

    const view = new google.picker.DocsView(
      google.picker.ViewId.DOCS
    )

    view.setMimeTypes(
      'application/zip,application/x-zip-compressed'
    )
    view.setMode(google.picker.DocsViewMode.LIST)

    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setAppId(PROJECT_NUMBER)
      .setDeveloperKey(API_KEY)
      .setOAuthToken(accessToken)
      .setOrigin(window.location.origin)
      .setTitle('Select a Photography ZIP')
      .setCallback(async (data: any) => {
        if (data.action === google.picker.Action.CANCEL) {
          setBusy(false)
          return
        }

        if (data.action !== google.picker.Action.PICKED) {
          return
        }

        try {
          const doc = data.docs?.[0]
          const fileId = doc?.id

          if (!fileId) {
            throw new Error('No Google Drive file was selected.')
          }

          const response = await fetch(
            'https://www.googleapis.com/drive/v3/files/' +
              encodeURIComponent(fileId) +
              '?fields=id,name,mimeType,size',
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          )

          if (!response.ok) {
            throw new Error(
              `Google Drive could not read this file (${response.status}).`
            )
          }

          const file: DriveZip = await response.json()

          if (!file.name?.toLowerCase().endsWith('.zip')) {
            throw new Error(
              'Only .zip photography archives are allowed.'
            )
          }

          if (
            ![
              'application/zip',
              'application/x-zip-compressed',
              'application/octet-stream'
            ].includes(file.mimeType)
          ) {
            throw new Error(
              'The selected file is not recognized as a ZIP archive.'
            )
          }

          setSelected(file)
          setMessage(
            'ZIP selected successfully. Photo extraction is the next step.'
          )
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Unable to verify selected ZIP.'
          )
        } finally {
          setBusy(false)
        }
      })
      .build()

    picker.setVisible(true)
  }

  function connectDrive() {
    if (!tokenClient.current) {
      setMessage('Google Drive is still initializing.')
      return
    }

    setBusy(true)
    setMessage('Opening Google authorization...')

    try {
      tokenClient.current.requestAccessToken({
        prompt: 'select_account'
      })
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Google authorization could not start.'
      )
      setBusy(false)
    }
  }

  return (
    <div className="pl-drive-zip">
      <div className="pl-drive-zip-heading">
        <Cloud size={23}/>
        <div>
          <h3>Google Drive Photography</h3>
          <p>
            Connect your club's Google Drive and select
            a ZIP archive of team photos.
          </p>
        </div>
      </div>

      <button
        type="button"
        className="pl-primary"
        disabled={!ready || busy}
        onClick={connectDrive}
      >
        <Cloud size={17}/>
        {!ready
          ? 'Loading Google Drive...'
          : busy
            ? 'Connecting...'
            : 'Connect Google Drive'}
      </button>

      {message && (
        <p className="pl-drive-zip-message" role="status">
          {message}
        </p>
      )}

      {selected && (
        <div className="pl-drive-zip-selected">
          <FileArchive size={24}/>
          <div>
            <strong>{selected.name}</strong>
            <small>
              Selected from Google Drive
              {selected.size
                ? ` · ${(Number(selected.size) / 1048576).toFixed(1)} MB`
                : ''}
            </small>
            <small>
              File verified. Not imported or published yet.
            </small>
          </div>
        </div>
      )}
    </div>
  )
}
