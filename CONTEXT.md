# Katbin

Katbin stores text as pastes that people can view and share.

## Language

**Saved paste page**:
A page where a person views the content of a saved paste.
_Avoid_: Paste viewer, paste display

**Original paste content**:
The exact text saved in a paste, before Markdown rendering or syntax highlighting.
_Avoid_: Rendered paste, displayed paste

**Copy feedback**:
The saved paste page reports whether the copy action succeeded or failed.
_Avoid_: Copy animation, clipboard toast

**Copy action**:
An action on the saved paste page that places the original paste content in the person's clipboard.
_Avoid_: Copy rendered view

**Owned paste**:
A paste created by a logged-in person.
_Avoid_: User paste, my paste

**Delete action**:
An action on the saved paste page and My Pastes list that deletes an owned paste.
_Avoid_: Remove button, destroy action

**Deleted paste**:
A paste that no longer appears on read, list, or edit surfaces.
_Avoid_: Removed paste, trashed paste

### Moderation

**Account ban**:
A restriction that prevents account use and permanently deletes all content owned by the account.
_Avoid_: Account deletion

**IP ban**:
A restriction that prevents requests from a specified IP address or address range from using Katbin.
_Avoid_: Signup block, account ban

**DMCA case**:
A record of a copyright complaint under the Digital Millennium Copyright Act, its affected content, and the administrator's decisions.
_Avoid_: Takedown, content deletion

**Permanent deletion**:
Removal of stored paste content that prevents its restoration through Katbin.
_Avoid_: Hidden paste, soft deletion

**Abuse activity record**:
An IP-linked record of paste creation, account creation, or a successful sign-in used to investigate misuse of Katbin.
_Avoid_: Visitor history, page-view history

### Usage

**Daily visitor estimate**:
An estimate of Katbin use based on distinct IP addresses per UTC day, rather than distinct people.
_Avoid_: Unique people, monthly unique visitors
