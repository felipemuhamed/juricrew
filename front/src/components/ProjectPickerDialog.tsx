import { useEffect, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, List, ListItemButton, ListItemText, Box, TextField
} from "@mui/material";
import { api } from "../api";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (projectId: string | null) => void; // null => root (no folder)
};

export default function ProjectPickerDialog({ open, onClose, onPick }: Props) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => { if (open) api.listProjects().then(setProjects); }, [open]);

  const create = async () => {
    if (!newName.trim()) return;
    const p = await api.createProject(newName.trim());
    setProjects([p, ...projects]);
    setNewName("");
    setCreating(false);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Move to folder</DialogTitle>
      <DialogContent>
        <List dense>
          <ListItemButton onClick={() => onPick(null)}>
            <ListItemText primary="(No folder)" secondary="Move to root" />
          </ListItemButton>
          {projects.map((p) => (
            <ListItemButton key={p.id} onClick={() => onPick(p.id)}>
              <ListItemText primary={p.name} />
            </ListItemButton>
          ))}
        </List>

        {creating ? (
          <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
            <TextField size="small" autoFocus placeholder="New folder name"
              value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button variant="contained" onClick={create}>Add</Button>
            <Button onClick={() => { setCreating(false); setNewName(""); }}>Cancel</Button>
          </Box>
        ) : (
          <Button sx={{ mt: 1 }} onClick={() => setCreating(true)}>+ New folder</Button>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}