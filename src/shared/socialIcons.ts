// Social-media icon block for HTML signatures. Icons are 40x40 PNGs baked in as
// base64 (rasterised once from simple monochrome glyphs). PNG — not SVG — because
// SVG and SVG data-URIs are stripped by Gmail, Outlook and most webmail; PNG
// delivered as a cid: inline attachment (see outboundImages.ts) renders in every
// client. Lives in shared so the send path (main) can upgrade + inline them too.

export interface SocialPlatform {
  id: string
  label: string
  placeholder: string
  png: string // base64 PNG (no data: prefix)
}

export const PLATFORMS: SocialPlatform[] = [
  { id: "twitter", label: "Twitter / X", placeholder: "https://x.com/yourhandle",
    png: "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAACBUlEQVR4AezY0W3CMBAGYCgMApu0OwDisZmkdBL6iIAdYJOyCKL/fyIocLYT+y5qK1HZcYjPuU9OE0d5GfzxvyfQeoH+5wwul8vJfD5/n81mr9YZaBtf52Ibig3O4Pl8/kbwejgcHhaLxQr7vRROQp0L7SGEVEAOamoul8tHH8hrnnUj1wRIdcUUEKBTY5Ds4pgrMoCTPKPR6Cg7jY0C7vf7Iy7tZyNGdr2QMRySVJvNRk2OAiJwsN1uV30gU7jdbvfF3I81CGSQN7IER0cUyE4vZCmOhiSQAVakBcf8rUAGlSKtOObuBGRgLtIDx7ydgQzuivTCMWcWkAPakJ445ssGclAKif7m8oWfUqrYc056E5siIM8XQ7LvoRbjeJ5iIAd3QJpwzGEC8gRYo9X6yeOsWC4nbC3VBEzcEGIC3vwWVAxsw4kQGyuyCJjAVbisrq9q2cAUjo+S2I1TOpNZwDhucHe3eiI7A7vi8G8nxQvZCZiLEyE2HshWYCkOPilWZBJoxYkQGwsyCvTCwSelFBkEeuNEiE0JUgGv32NcX5lgu5UU8pr7FssdBeTBQL17zgX6sw7FkFiF1MuFAo7HY76dsNZJXXH1SQPIE1eiur9uFZCfH/CN5A0BFdppaBD6XAqRzIGTcRKmaFVRQEYQSRhb/u6zMgdzxXIEgbHg3zj+BFpn/QcAAP//556UXQAAAAZJREFUAwBbonVgb2iGKAAAAABJRU5ErkJggg==" },
  { id: "linkedin", label: "LinkedIn", placeholder: "https://www.linkedin.com/in/you",
    png: "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAACIUlEQVR4AeyYwW3CQBAAz+6BF1QALYCE0gM888sHGiAv5FdoAD68ki89IBBpgQqAD/QQZ8f44LAUc4aTdSGJWO+ye96dLL4FXaiMv06n0+x2u++iNyJfInFJQq1NWrtpIKkToIC8SWAVx/Gz6JpIIFLWi1q1tPYqZUlqJ4CpY5B4/LgMUiYVikFLfYLTLQKyGQZB8KI9vmnYQvncn3wD0zyw8QxWtcNDXQWQHeQhW4IUAJhYvl4eB7DdbqvxeKx6vV6pzbbuoMxLValUFKCNRqM0SGvA/X6fQB0OB7VerxO7jIs1YBRFCun3+2VwnWpYA3JHmZ2jHmINyLP3EJuEjcQmQujAvWLdQQrrYqZt+obDYTKK0AgdZ/frNbdoa8C85AADk+0afgCRvPvzYk4Arw1vnt8sfB6UGXMCaBZfLBaKUcRI0oXoZL1e128L6bsB6Y5ZcTabKT3MzbEEpLnO1r4bMFsIOO0zbe0rqp0DFgW4tv6vAF7rw+3x/w7e3rvjndYdNHfkT/Yx5flqrjt7i1nWgHq+oc35ho0PmMlkclGdoU2c2HK5vIjZvrEGpBjfEMBkk+MjxhozBlgkP3SJAWrGbG1rQNuErtf9CsDY9X/tMF9MB3cOE7pOteP4be46q6t8cvw25/ht6iqh6zxy/DYNZUR8SuKRiG+vEWw8g0qMV6HzCRI4mM6n/ClkSz73D4HdipS5u6m1TWu3UhZBUOobAAD//+1OWUcAAAAGSURBVAMAdEf9l+iTXvcAAAAASUVORK5CYII=" },
  { id: "facebook", label: "Facebook", placeholder: "https://www.facebook.com/yourpage",
    png: "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAACDUlEQVR4AeyYQW7CMBBFndwBNnADrgCS1TvAsrtu4AJ0hViVC8CGVbuEOyAkegW4ALDiDk3nWw4MEYmJnURuFZTBgz3jeRknY+RQsE+/3+8OBoNPao8kPyRRRYJYRx27y5DEFZBAPmhgF0XRK7VtkoCkqgux2jr2TrOo2ApQd4xVjx9fY80kQlKQUp/g4hQBshsGQfAW9/jWgi2kdX/xDSzmARuewVbc4WHbAiDeIA/ZFFIAQKX5+lUDuq5MKRmUUgrJpNFoWHMWBgiIyWQiVquVGA6HdzKfzxWwDWUhgIADRKfTSWWATepgxkAhgMhYRgyx3+/FdrvNMkkdcwZEZnjmADIajQT9dbrKdDoVl8slFSJrwBmw2Wzezb9YLKxh7ibSP5wBkUE9VymNM2ApVGzS/wmIZeU1j92wqoOohVxgCx9u96xulUEppeBvrikYbOFjsns0bgVoUzIOh8Oj+MY+K0DUOtQ2lBToPAr6koK6iGLN7Z7VrQAxOQICLpkZ9CXFJuOIAbEGhPNNytNqQNfc1hmsM+iaAVf/P/EMRi53yYsw113mZL4RMnhmHblV7CgQwK3X69z+Boczjt82BiPjMPZl7LfY4ozGOQzo+G2D47dlDp9KTen4bRnSsnxT1BmJb9cMbHgGBSnvROcTJODAdDvl15A9Wvcvgj2ROL3d5J/nQqyTjt3TLMr/FwAA//+XzH3HAAAABklEQVQDADpy/Zex+FaCAAAAAElFTkSuQmCC" },
  { id: "instagram", label: "Instagram", placeholder: "https://www.instagram.com/you",
    png: "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAEpklEQVR4AeyYTWhcVRTHJx8QhWQhEWkpKMlOQag04ELQTQLNcprMLEZJ3RR3fnYhLmx1owu/QVC6sQFnMRM6K4mQbBRciC3tQnRlAwVpKQ2FJtAW8tHf//Xcy3133puZN0lLFw33/+6595zzP/857yNvZrD0iP89FrjXE9RzB6vV6vT8/Pwp5rOg0SfOGsd0r8K7CkTI25VK5fLu7u7KwMDAaeYFUOkTC8axIk5xdxOaKxCCQ2AFId9CMgH2e0yIWzXAoTzyTIGWsEJSfCqusfcrXWj2A+UCcTD5oRrqaKbITIGk/gSeB25cwjjWbDYPgtlGo1HtB8oFB8UFxMmUDNVSzWQRHtoE2nWhT5XEqVOQvgRaycYeDrVa7am5ubkpOO8ODg7WmJsB3bTVDrZKpTaBXBfvBhGX1KlgvSdza2vrJML+osYv29vbpxF4CkLfSfbD2rgigXwCdS68IT5NovbpgIA3HBXiqqxVK6wxYRpcWLqDOzs7r3hPqXSt2Wz2fFq5sY6AsuFIwBOat8IFXbxuNfyNE2lIC6T9kwGBb32wlzLL5fIzPHi/QtQNHOfBOcN57cmnGPaSQde+x/gbXMH+bGRk5D9sDV8r0pAWSOSTIBkQbCRGzgEB5eHh4X+Ie4+QcRCPcfkUo1g5uZ5/oGMvguewP6rX6ze1T1xYy2uQr+0m0WY3WEF1K0tYnK6Yc5YT+7quCwu0U3YmYq7Thdc2NzefEGTjr4NwnLHccK+rXVjg0NDQh7CqK0ylEnfiSU7Z65yy35eXl+8KsrUnXxJ0/zBuufdXPR4LC6Q7CwF3fWlp6ctgnTLN5zsZ5aZi8xaFBHId6fHhu0fBH/OI3X4UM24czt11LiQQtmeBHxsbG3/6RY6REZPiyEnz20UF+sSHZRQVeCUUNjY29nK4zrIzYlIcWTnhXiGB3JkXSF4HyeAufSsxOhyimHXj6JCRdhUSqFQKLmo21Ph39oHZbZP5as4R5brtjnNhgfyD/xxG30Xu0i+4M3/mLeTV2dnZEUG29uQj1o11y3XrnubCAlut1nWYT4BglGp057fR0dE7gmycvnPYGicsV3bPKCxQzFxHeg07hu07iZ03FKOvC8rJi8ndjwXedpF0YczZWbNE8ob8AnFf45cIptRYl08xik15ogVxYS2vQWEpgbwsXtam4bDNuZNOGf/O3kfA0wRNAXVVmNKefIphv9vwtSIN6fdBXhb/CJgOcKGXg3VHE0EXQMugx1HHeOe0GgfcOtKQFshbyCqBa8CNj53xAOewxppp8OVSp1i7PBq+0Ww4zCOjYfa+T8btT29UO6nXJpBP8B0edZIped/jLFQucuj5dCeJHQ7iAhe5OSpB2KrVDrair52B503sf4Eb+pR6bb8K8bI+eT9QLrgKqb4uiBMzGaqlmskiPLR1UE4u9P+ZZ4DvJLaGLuaj+uT9AIKjQBxMfqjGjNX0m87IFCinEsAM18U7rMMbh+W+jDVxqwZQQzJJcwW6aF0XEExCNkPX9HPFInZfv26Rt2gc6tikuF2dvLmrQJcI2SoP3k+Yj4O+ft0i77hx6LQ66o5zzwI7sjxA5yMv8B4AAAD//y3Nf7gAAAAGSURBVAMAmgCyb29h2l0AAAAASUVORK5CYII=" },
  { id: "tiktok", label: "TikTok", placeholder: "https://www.tiktok.com/@you",
    png: "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAACE0lEQVR4AeyW3ZGCMBSFyWoh2In2oI5vC5XoVqL75qg9aCdQiMKegwSzDD/5G4YHmFwSkpD7cZLc8BWM/JoAXSdoUnA0Cq7X6+Vms0lguWLJdrs9uEB6m2IhxDdAQpiawjzPWa/WGZW9AXZ4DaFo1NHe2TQEIAH2vNnYUIBU8ThmQLJFmOqEm4kPujaUgpInxGa6ExR23O129U0l+1X5UIBp5fFdIFiUZVnv5hkEcDabraDcz5vtc0cIqoN/GsvSIIDn8zm9XC6H6/UqALuA7xhwKzyfUO5MToBcQzwpsJ7u8NI7XegTEJZgt9vtwec+swYE1PH1eiVQgjFu2efItt0KEHDaitmCyfeMAQHHqVQVS8sNEDOnYfAY5iUZA8IrpxRZkVKsp0W5AU7MaUWLp5sRIDcF/DKGIQsCrD9vShUDNtyMAJ/PZwXHsebzeW8cYz8XMwKsO6oDy3asQ/VDnD7CCLCuGEAaf0Yx9Wq9VryTH1fPjQAZZDGAGv0jBmr5h8I1il3OEFQpCNhfvGOdjADpBUfVvzMVAHshBP9QcgZu9FFD0EP3xMB7jckYkCoCkudp39piCFo1ejWoNAbk2CUknavTzSZaEbgZH/ngalaAdEpIQMSlmsXfCcuoKwI3+/gwa0DpvAQ9ca2xLOt95c6AvkDaxpkA25TRrZ8U1FWqrd+kYJsyuvWTgrpKtfUbvYJ/AAAA//8iS6C2AAAABklEQVQDAG+ltFGWURluAAAAAElFTkSuQmCC" },
  { id: "youtube", label: "YouTube", placeholder: "https://www.youtube.com/@you",
    png: "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAB/klEQVR4AeyXMW7CQBBFjSX36elzAJRI9CnTIIFdOEdIBRdIcgGocoS4sEGiSZkeKREHSE+f3hLkf2xHmrUxhl1MkIx2WHt2dv7TZ0HGtv75qwHU/YAaBxsHdR3Q3X/ZZ7Df798MBoMn13XfPM8LTQZ7sjc1ylwudLDX612xgW3bn61W6xkN/M1m45oM9mRvalCLmsjlRg6QhY7jfKDSR9Q1fGpSWxXMAaLwFUUdRN2jk2oLXQGYnoc6nRMwuPFTBlwmQwDiTNwn6fO9qwwq4PX50BJlAAoGFdBJyqq/d7tdC9/C6hv2VAJQMAjAPXt3LhNwMplYhN1ZdOSCEUBqt9ttazQabYPXzJkIY4AZDF2km3Q1y+nMxgEzGAISlMBZ7pj5ZIDHwBTtORlgFEXWcDi0FotFkW7lnHFAAhGMgJUpSgqNAa5WK2s8Hm+D1yWaBy0ZAaRbdI3uHaReoVgA4nkvrrBHlBAqiiKR07lRGVTAb53mJvYCUDCogO8mRHR6AFAwCMDZbPaF5gHiXCNIGf70BSCzcRw/Yl4i6h7LVFvo5gDn8/kPCu9QVaeTATWpDV0xcoBcZSF+Oh7W6/UtzgT/1QV4TotMBnQC9qYGtaiJXG4UAmZVPA/T6fSFDcIw9EwGe7I3NTK9orkUsGhD3bkGUNfxxsHGQV0HdPf/AgAA//+m3GKrAAAABklEQVQDAAG8RWACJtFnAAAAAElFTkSuQmCC" },
  { id: "website", label: "Website", placeholder: "https://example.com",
    png: "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAFRklEQVR4AeyYO2xcRRSGrx/bICEgRaS4wRWYwlFaEBKhchpHVvzYlRUEKZLQh4oUKEWoQk+SIkEga9f2RlbcxA0ECUEbxQULVWgSyUUARUqzfuT7J3Nm547v3fXaiuQi1jkz55w5j/+emb0PD2aH/O81wINu0IE6OD8//87c3Nwk/PXs7Ox1uO75umzwpHwOAnJfACl8FiD32u32052dnbvwVUBcgKueL8gG35WPfBXDWt/UF0AVodifFP6RShPwXmlCMYpVjr0GyW9PAKempt4meV1FCBqDU3qeGtCLbGPKoVzKiU9P6glwenr6eKVS+YNM2j6mQOsU+2pwcPB9LG/AovsMYqZsQ2vyQVmHY6oqp3LHxiK5K0AloMg9AuOuPUY/t7S0dHx5efm77e3tj9AdAeaK2ClZNrq1tTUiH/liOwcrlsnRmHKrhtNKhlKA2gISNIg7BhvdQRin4G1mo89NAMx9Mbrr4sDAwDfIjnzMOIpyMDk6phqq5bSCoRQgW/A9/qFzdOYmRabhp9hjOumVABpgv3qbrTlVsfC0cjnDy2HM13qpJWMhQP9Li8/cHTqj20gufGZmJgZgoDK23XVQzomPTJnPFXey6mu69XgoBMgVXo6cdG7OR3oQ6dSoKUNDQwHU8PDwI7PHPmbzs3Iqt1OTms6mYRdAfyVha3G6zLak24rZ0SduZKjX6wFULJcB9DnjRoz52mTr0C6AXMnZznK2TqJwtiJ7KobuRQvORr5wEdGaE33ucAvCN67tfHIA/XMzPCG4+h+cV/lgWxy6V+5avAKouMaExxCccwA3Nzc/DisIAFxl6kYGsMjHQHfzyTi7uRophhxAqug+xeTocaPR+NtJr3DwNcKPhVIxhiwHkHa/i4PRhm4R3dgcmUdTP2yB0rVUx3EDdpRgyAPE4y3Y6ARb/Es3xtG272Tqx9oXsGg0XUt1nE7ARjGGXQDN6dDMuS0G1f+w0QPa/Wk3xtF+CLdTP9bcbYY5S9dSHZ8HsFGMId9BWv+PeTEf5ZHkHv5lMz6BUh8WDPyjdC3V8T0KO0ow5AHiEW6ayCPVavU95ldKvsZIVCTGkAfIM/S3yDHjfW4y1gtk65L9WApcMvPJiv7SGimG3BlcWFj4lyRrsCPaHd71nKF0yIoA2ptOV4BJjTWPIbO/HEAZCfhJs+dxvh/sduFNnQnf8IrVsQapCHRYlOBzhxsz+eLacslvsSyLi4tyakn2fJVER7ycm6L3vtFarVYGqPAifE59rlrOlq9tupt3dVBWriQO1AG+KXs35hkaAFI8dJ1nbbjdJPHKqdzOnNR0Ng2FAP2V6HtEPuIzPJ5uSIiZAx3OFwXi8xpeseJ3Q4v1uc6YztzwNRHzVAhQLu12+0vmsNUAOE9nmnDYbl/cOmQ/CsIyk3PvkoqFm8qVdf5avlbHEkmlAFdWVv7jjOm75Enkr6tep0jYQp4KV/y6e2Hwa7bd4fx5u+5xyuFDsieqoVpmSOdSgHJsNpsPSXAKOXQSWefmFgUf8op+ic/GAWyO6MwthLDVrP3Odl6SL3atKRbRUUu5VcNpJUNXgIpRArbgQ+T4TKJm43TvGvwzyjNYpM7Z9j4HwF+AvsZCuJUgixrKqdxSunFPgArWFvD9UKPYZ+hxN1EdvenG/GD/DomtLeVQLuWMF8rkPQG0YP3SSP6BimALTxzkXrSmGMUqRy/neL0vgBaoIhQ7ValUjlD4NKzPR92GdAzEN2SDT8tHvoqx+H7mfQG0AnpuUngV/hYQF+Ga54uywavyMf/9zAcCuJ+C/cYceoAvAAAA//8Ir99lAAAABklEQVQDANVijW+/m6dEAAAAAElFTkSuQmCC" },
]

function dataUri(png: string): string {
  return `data:image/png;base64,${png}`
}

const START = "<!--deskmail-social-start-->"
const END = "<!--deskmail-social-end-->"

export interface SocialLink {
  id: string
  url: string
}

// Build the HTML row for the chosen platforms, wrapped in comment markers so we
// can pull it back out when the signature is re-opened for editing.
export function buildSocialRow(links: SocialLink[]): string {
  const items = links
    .filter((l) => l.url.trim())
    .map((l) => {
      const p = PLATFORMS.find((x) => x.id === l.id)
      if (!p) return ""
      const url = l.url.trim().replace(/"/g, "%22")
      // display:inline-block keeps the icons on one horizontal line even where a
      // CSS reset (e.g. Tailwind) would otherwise force img { display:block }.
      return `<a data-platform="${p.id}" href="${url}" target="_blank" style="display:inline-block;margin-right:8px;text-decoration:none"><img src="${dataUri(p.png)}" alt="${p.label}" width="20" height="20" style="display:inline-block;vertical-align:middle;border:0"></a>`
    })
    .join("")
  if (!items) return ""
  return `${START}<div style="margin-top:10px">${items}</div>${END}`
}

// Split a stored signature body into its main HTML and the social block (if any).
export function splitSocial(body: string): { main: string; social: string } {
  const re = new RegExp(`${START}[\\s\\S]*?${END}`)
  const m = re.exec(body)
  return m ? { main: body.replace(m[0], "").trim(), social: m[0] } : { main: body, social: "" }
}

// Recover platform -> url from a previously-built social block, to refill the UI.
export function parseSocialRow(social: string): SocialLink[] {
  const re = /data-platform="([^"]+)"\s+href="([^"]*)"/g
  const out: SocialLink[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(social)) !== null) out.push({ id: m[1], url: m[2].replace(/%22/g, '"') })
  return out
}

// Upgrade a legacy signature whose social icons were stored as SVG data-URIs to
// the new PNG block, so signatures saved before the PNG switch still deliver.
// Pure: rebuilds the block from the platforms/urls already encoded in it.
export function upgradeLegacySocial(body: string): string {
  const { main, social } = splitSocial(body)
  if (!social || !social.includes("image/svg")) return body
  const rebuilt = buildSocialRow(parseSocialRow(social))
  return rebuilt ? `${main}${rebuilt}` : main
}
