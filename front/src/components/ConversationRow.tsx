import { Box, ListItem, ListItemButton, ListItemText } from "@mui/material";
import ConversationMenu from "./ConversationMenu";
import { Conv } from "../api";

type Props = {
  c: Conv;
  selected: boolean;
  onClick: () => void;

  // menu actions
  archived?: boolean;
  onArchive: (archived: boolean) => void;
  onMove: () => void;
  onDelete: () => void;
};

export default function ConversationRow({
  c,
  selected,
  onClick,
  archived,
  onArchive,
  onMove,
  onDelete,
}: Props) {
  return (
    <Box key={c.id} sx={{ display: "flex", alignItems: "center" }}>
      <ListItem disablePadding sx={{ flex: 1 }}>
        <ListItemButton selected={selected} onClick={onClick} sx={{ flex: 1 }}>
          <ListItemText primary={c.title || "(untitled)"} />
        </ListItemButton>
      </ListItem>
      <ConversationMenu
        archived={!!archived}
        onArchive={(a) => onArchive(a)}
        onMove={onMove}
        onDelete={onDelete}
      />
    </Box>
  );
}