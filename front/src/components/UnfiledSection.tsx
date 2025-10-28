import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import ConversationMenu from "./ConversationMenu";
import { Conv } from "../api";

type Props = {
  conversations: Conv[]; // unfiled (or archived flat list when archivedView)
  currentId?: string;
  onSelect: (c: Conv) => void;
  onCreate: () => void;
  onArchive: (c: Conv, archived: boolean) => void;
  onMove: (c: Conv) => void;
  onDelete: (c: Conv) => void;
  onRename: (c: Conv) => void;
};

export default function UnfiledSection({
  conversations,
  currentId,
  onSelect,
  onCreate,
  onArchive,
  onMove,
  onDelete,
  onRename,
}: Props) {
  return (
    <Box sx={{ pt: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", px: 1, pb: 0.5 }}>
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          Conversations
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="New conversation">
          <IconButton size="small" onClick={onCreate} sx={{ color: "rgba(255,255,255,0.9)" }}>
            <AddCircleOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <List dense disablePadding>
        {conversations.map((c) => (
          <ListItem
            key={c.id}
            disablePadding
            secondaryAction={
              <ConversationMenu
                onArchive={(a) => onArchive(c, a)}
                onMove={() => onMove(c)}
                onDelete={() => onDelete(c)}
                onRename={() => onRename(c)}
              />
            }
          >
            <ListItemButton selected={c.id === currentId} onClick={() => onSelect(c)} sx={{ px: 1.25 }}>
              <ListItemText primary={c.title} primaryTypographyProps={{ noWrap: true }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}