import { Box, IconButton, List, Tooltip, Typography } from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import ConversationRow from "./ConversationRow";
import { Conv } from "../api";

type Props = {
  items: Conv[];
  currentId?: string;
  onSelect: (c: Conv) => void;

  onCreate: () => void;

  // menu actions
  archived?: boolean;
  onArchive: (c: Conv, archived: boolean) => void;
  onMove: (c: Conv) => void;
  onDelete: (c: Conv) => void;
};

export default function UnfiledConversations({
  items,
  currentId,
  onSelect,
  onCreate,
  archived,
  onArchive,
  onMove,
  onDelete,
}: Props) {
  return (
    <Box sx={{ px: 1.5, pt: 1.25, pb: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          Conversations
        </Typography>
        <Tooltip title="New conversation">
          <IconButton
            size="small"
            onClick={onCreate}
            sx={{ color: "rgba(255,255,255,0.85)", p: 0.25 }}
          >
            <AddCircleOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <List dense disablePadding>
        {items.map((c) => (
          <ConversationRow
            key={c.id}
            c={c}
            selected={c.id === currentId}
            onClick={() => onSelect(c)}
            archived={archived}
            onArchive={(a) => onArchive(c, a)}
            onMove={() => onMove(c)}
            onDelete={() => onDelete(c)}
          />
        ))}
      </List>
    </Box>
  );
}