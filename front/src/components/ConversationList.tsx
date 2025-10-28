import { Box, List, ListItemButton, ListItemText, Typography, Button, Paper } from "@mui/material";
import ConversationMenu from "./ConversationMenu";
import { Conv } from "../api";

type Props = {
  conversations: Conv[];
  currentId?: string;
  onSelect: (c: Conv) => void;
  onCreate: () => void;

  onArchive: (c: Conv, archived: boolean) => void;
  onMove: (c: Conv) => void;
  onDelete: (c: Conv) => void;

  /** true when viewing archived list */
  archivedView?: boolean;
};

export default function ConversationList({
  conversations,
  currentId,
  onSelect,
  onCreate,
  onArchive,
  onMove,
  onDelete,
  archivedView,
}: Props) {
  return (
    <Paper sx={{ p: 2, display: "grid", gap: 1 }}>
      <Typography variant="h6">Conversations</Typography>
      <Button size="small" variant="outlined" onClick={onCreate}>
        New Conversation
      </Button>
      <Box sx={{ maxHeight: "70vh", overflow: "auto" }}>
        <List dense>
          {conversations.map((c) => (
            <Box key={c.id} sx={{ display: "flex", alignItems: "center" }}>
              <ListItemButton selected={c.id === currentId} onClick={() => onSelect(c)} sx={{ flex: 1 }}>
                <ListItemText
                  primary={c.title}
                  secondary={new Date(c.updatedAt).toLocaleString()}
                />
              </ListItemButton>

              {/* Only pass the props ConversationMenu actually supports */}
              <ConversationMenu
                archived={!!archivedView}
                onArchive={(a) => onArchive(c, a)}
                onMove={() => onMove(c)}
                onDelete={() => onDelete(c)}
              />
            </Box>
          ))}
        </List>
      </Box>
    </Paper>
  );
}
