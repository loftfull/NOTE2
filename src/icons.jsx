import React from 'react'

function Glyph({name}){
  switch(name){
    case 'add': return <><path d="M12 5v14"/><path d="M5 12h14"/></>
    case 'close': return <><path d="m7 7 10 10"/><path d="m17 7-10 10"/></>
    case 'arrow_back': case 'chevron_left': return <><path d="m14.5 6-6 6 6 6"/></>
    case 'arrow_forward': case 'chevron_right': return <><path d="m9.5 6 6 6-6 6"/></>
    case 'search': return <><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></>
    case 'search_off': return <><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/><path d="M5 5l14 14"/></>
    case 'person': return <><circle cx="12" cy="8" r="3"/><path d="M6.5 19c.7-3.2 2.5-5 5.5-5s4.8 1.8 5.5 5"/></>
    case 'today': case 'event': return <><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16"/><path d="M8 13h3M8 16h5"/></>
    case 'edit_note': return <><path d="M5 4.5h9l4 4V19.5H5z"/><path d="M14 4.5v4h4"/><path d="m9 16 1.1-3.2 5-5 2.1 2.1-5 5z"/></>
    case 'note_add': return <><path d="M5 4.5h9l4 4V19.5H5z"/><path d="M14 4.5v4h4M8 14h6M11 11v6"/></>
    case 'article': case 'description': case 'notes': return <><path d="M5 3.5h10l4 4v13H5z"/><path d="M15 3.5v4h4M8 11h8M8 14h8M8 17h5"/></>
    case 'library_books': return <><rect x="5" y="5" width="13" height="15" rx="1.5"/><path d="M8 3h11v14M8 9h7M8 13h7M8 17h5"/></>
    case 'upload_file': return <><path d="M5 4.5h9l4 4V19.5H5z"/><path d="M14 4.5v4h4M12 16V10M9.5 12.5 12 10l2.5 2.5"/></>
    case 'folder_open': return <><path d="M3.5 7h6l2-2h8.5v3H6z"/><path d="m5 8-1.5 11h15L21 8z"/></>
    case 'attach_file': return <><path d="M8 12.5 13.7 6.8a3 3 0 0 1 4.3 4.3l-7 7a4 4 0 1 1-5.7-5.7l7.4-7.4"/></>
    case 'inventory_2': return <><path d="M4 7h16v13H4zM3.5 4h17v4h-17z"/><path d="M9 11h6"/></>
    case 'mic': return <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6"/></>
    case 'graphic_eq': return <><path d="M4 14v-4M8 17V7M12 19V5M16 16V8M20 14v-4"/></>
    case 'photo_camera': return <><path d="M4 8h4l1.5-2h5L16 8h4v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></>
    case 'image': return <><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 17 4-4 3 3 2-2 5 4"/></>
    case 'photo_library': case 'collections': return <><rect x="5" y="6" width="14" height="13" rx="2"/><path d="M8 3h11v13"/><circle cx="9.5" cy="10.5" r="1.4"/><path d="m6.5 17 3.5-3.5 2.8 2.8 1.8-1.8 3 2.5"/></>
    case 'play_circle': return <><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/></>
    case 'smart_display': return <><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m10 9 5 3-5 3z"/></>
    case 'movie': case 'videocam': return <><rect x="3.5" y="6" width="12" height="12" rx="2"/><path d="m15.5 10 5-3v10l-5-3z"/></>
    case 'picture_as_pdf': return <><path d="M5 3.5h10l4 4v13H5z"/><path d="M15 3.5v4h4"/><path d="M7.5 16v-5h2a1.5 1.5 0 0 1 0 3h-2M12 16v-5h1.5c2 0 3 1 3 2.5S15.5 16 13.5 16z"/></>
    case 'language': return <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.7 5.5 3.7 9S14.5 18.5 12 21M12 3C9.5 5.5 8.3 8.5 8.3 12s1.2 6.5 3.7 9"/></>
    case 'link': return <><path d="m9.5 14.5-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0"/><path d="m14.5 9.5 1-1a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"/><path d="m8.5 15.5 7-7"/></>
    case 'check': return <path d="m5 12 4 4 10-10"/>
    case 'check_circle': return <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16.5 9"/></>
    case 'check_box': return <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.7 2.7L16.5 9"/></>
    case 'star': return <path d="m12 3 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z"/>
    case 'push_pin': return <><path d="M8 4h8l-1 5 3 3H6l3-3z"/><path d="M12 12v9"/></>
    case 'delete': return <><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v6M14 10v6"/></>
    case 'more_horiz': return <><circle cx="6" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1" fill="currentColor" stroke="none"/></>
    case 'menu': return <><path d="M4 7h16M4 12h16M4 17h16"/></>
    case 'tune': return <><path d="M4 7h10M17 7h3M4 12h3M10 12h10M4 17h8M15 17h5"/><circle cx="15.5" cy="7" r="1.5"/><circle cx="8.5" cy="12" r="1.5"/><circle cx="13.5" cy="17" r="1.5"/></>
    case 'tag': return <><path d="M4 5h7l9 9-6 6-10-10z"/><circle cx="8" cy="9" r="1"/></>
    case 'title': return <><path d="M5 6h14M12 6v13M8 19h8"/></>
    case 'format_list_bulleted': return <><circle cx="5" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1" fill="currentColor" stroke="none"/><path d="M9 7h11M9 12h11M9 17h11"/></>
    case 'format_quote': return <><path d="M5 8h5v5H7c0 2-1 3-2 4M14 8h5v5h-3c0 2-1 3-2 4"/></>
    case 'code': return <><path d="m9 7-5 5 5 5M15 7l5 5-5 5"/></>
    case 'table': case 'table_view': return <><rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 10h16M4 14.5h16M10 5v14M15 5v14"/></>
    case 'summarize': return <><path d="M5 3.5h10l4 4v13H5z"/><path d="M15 3.5v4h4M8 11h8M8 14h6M8 17h4"/></>
    case 'category': return <><circle cx="8" cy="8" r="3"/><rect x="13" y="5" width="6" height="6" rx="1"/><path d="m8 14 3 5H5zM15 15h4v4h-4z"/></>
    case 'auto_awesome': return <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM18 14l.7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7zM6 13l.8 2.5L9 16l-2.2.5L6 19l-.8-2.5L3 16l2.2-.5z"/></>
    case 'open_in_new': return <><path d="M13 5h6v6M19 5l-8 8"/><path d="M17 13v6H5V7h6"/></>
    case 'content_copy': return <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5H5v11h3"/></>
    case 'content_paste': return <><path d="M9 5h6l1 2h3v13H5V7h3z"/><path d="M9 3h6v4H9z"/></>
    case 'logout': return <><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/></>
    case 'cloud_off': return <><path d="M5 5l14 14"/><path d="M7 17H6a3 3 0 0 1-.7-5.9A6 6 0 0 1 16 8.5c2.5.2 4 1.8 4 4 0 1-.3 1.8-.8 2.5"/></>
    case 'progress_activity': return <><path d="M12 3a9 9 0 0 1 8.4 5.7M21 12a9 9 0 0 1-5.7 8.4M12 21a9 9 0 0 1-8.4-5.7M3 12a9 9 0 0 1 5.7-8.4"/></>
    case 'hub': return <><circle cx="12" cy="12" r="2.2"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="m10.5 10.5-4-3M13.5 10.5l4-3M10.5 13.5l-4 3M13.5 13.5l4 3"/></>
    case 'forum': return <><path d="M4 5h13v10H9l-4 3v-3H4z"/><path d="M9 8h5M9 11h4"/></>
    case 'slideshow': return <><rect x="3.5" y="5" width="17" height="13" rx="2"/><path d="m10 9 5 3-5 3zM8 21h8"/></>
    case 'restart_alt': return <><path d="M6 8V4l-3 3 3 3V8a7 7 0 1 1-1 8"/></>
    default: return <><rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 9h6M9 12h6M9 15h4"/></>
  }
}

export function Icon({name,size=21,className='',title}){
  return <span className={`material-symbols-rounded appIcon ${className}`} style={{fontSize:size}} aria-hidden={title?undefined:true} title={title}>
    <svg viewBox="0 0 24 24" role={title?'img':undefined} aria-label={title||undefined} focusable="false"><Glyph name={name}/></svg>
  </span>
}
