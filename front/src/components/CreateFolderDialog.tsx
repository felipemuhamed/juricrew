import { useEffect, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Box, MenuItem, InputLabel, FormControl, Select, SelectChangeEvent
} from "@mui/material";
import { api, Project } from "../api";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (created: Project) => void;
  /** If provided, parent is preselected; pass null for (None). */
  parentId?: string | null;
  /** Hide parent selector (force parentId), default false */
  lockParent?: boolean;
};

export default function CreateFolderDialog({ open, onClose, onCreated, parentId, lockParent = false }: Props) {
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      if (!lockParent) {
        const list = await api.listProjects();
        setProjects(list);
      } else {
        setProjects([]);
      }
    })();
    setName("");
    setSelectedParentId(parentId ?? "");
  }, [open, parentId, lockParent]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const created = await api.createProject(name.trim(), selectedParentId || null);
    onCreated(created);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>New folder</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "grid", gap: 2, mt: 1 }}>
          <TextField
            label="Folder name"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          {!lockParent && (
            <FormControl fullWidth>
              <InputLabel id="parent-select-label">Parent folder (optional)</InputLabel>
              <Select
                labelId="parent-select-label"
                label="Parent folder (optional)"
                value={selectedParentId}
                onChange={(e: SelectChangeEvent) => setSelectedParentId(e.target.value)}
              >
                <MenuItem value="">(None)</MenuItem>
                {projects.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!name.trim()}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}