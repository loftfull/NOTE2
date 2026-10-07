# NOTE2 v4.9 — GitHub interaction/editor survey

Date: 2026-08-19

## Goal

Correct the failure mode where NOTE2 looked like a static design template. The survey focused on interaction contracts, note editing, local-first behavior, navigation, and editable settings. The v4.0 visual baseline remains unchanged.

## Candidate set (60+ repositories screened)

### Block / WYSIWYG editors
1. yoopta-editor/Yoopta-Editor
2. TypeCellOS/BlockNote
3. ryuever/react-tapable-editor
4. vincentdchan/blocky-editor
5. sereneinserenade/notitap
6. 0xycvv/hexx
7. pileax-ai/yiitap
8. BuhayovA/react-notion-wysiwyg
9. hunvreus/pagescms-editor
10. AlexandroMtzG/novel-remix
11. Sachin-chaurasiya/BlockEditor
12. domternal/domternal
13. PatoSala/react-native-blocks
14. rahmanef63/open-silong
15. stefanraath3/email-builder-wysiwyg
16. pubwave/pubwave-editor
17. fabaohs/Notion
18. JackUait/blok
19. Haywayaheadshot/h-j-project
20. g-bastianelli/tiptap-react-notion

### Local-first / note applications
21. 0xGG/crossnote-app
22. Beaver-Notes/Beaver-pocket
23. bukamasedo/graphite
24. Pikos-App/pikos
25. umitkara/FlowDesk
26. SerwisKacperek/Basalt
27. IdrisGit/MarkUp
28. ErkanSoftwareDeveloper/DBnote
29. jfolcini/agaric
30. zexadev/lapisnote
31. Katania91/KatanOS
32. codewithabhi101/local-first-notes-app
33. victorbuenog/AstraNotes
34. inferis995/netnote
35. jameswibe79/scratch-local-notes
36. TheFool-yiqi/startrail_notes
37. ZuziaDev/NoteAI
38. MDF05/MDFNote-app
39. opanda01/offline-first-local-notes
40. ujjwal-97/motion

### Markdown / note-taking applications
41. notable/notable
42. blueberrycongee/Lumina-Note
43. bangle-io/bangle-io
44. mdyna/mdyna-app
45. GarliqBread/Noteup
46. sumyat-aung/markdown-supported-notes-app
47. jacksonpf1/notella
48. Prathamesh010/Noteit
49. alexanderbluhm/notes
50. noejunior299/noteMark
51. sosukesuzuki/rapunzel-editor
52. markom9822/MarkNote-App
53. cbdefontenay/hugvi
54. darkcl/Notorious
55. SaurabPoudel/note-taking-app
56. hanzhichao/finite
57. jvhti/note-taking
58. Hanqk97/Markdown_Note_Taking_App
59. JAsaxon/NoteTakingReactApp
60. ijahangirabbas/workspace

## Patterns assimilated

- A visible note row is an object opener, not decoration.
- Creation happens in context; it must not route through a technical staging page.
- Editing uses immediate local state and debounced persistence.
- Pin/favorite/delete are object actions, not separate workflow screens.
- Search results reopen the original object.
- Settings must have immediately visible effect and persistent state.
- Mobile shell must not duplicate page titles with a second sticky header.
- Empty states should offer a next action, not placeholder sample metrics.
- Primary navigation stays at five destinations.

## Deliberately not assimilated

- No wholesale editor-framework migration in v4.9.
- No new top-level destination.
- No provider-specific Instagram/YouTube silo.
- No copied code from surveyed repositories.
- No SaaS dashboard metrics or fake activity.

## Shortlist for a later real block-editor migration

- TypeCellOS/BlockNote — mature block editor contract and extensibility model.
- yoopta-editor/Yoopta-Editor — block composition and plugin model.
- bangle-io/bangle-io — local-first editor/application behavior.
- notable/notable — content-first notes library patterns.
- 0xGG/crossnote-app — local-first knowledge/note interaction patterns.

Any future editor replacement still requires a separate provenance/license/dependency review before code import.
