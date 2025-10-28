import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button
} from "@mui/material";

type Props = {
  open: boolean;
  initialTitle: string;
  onClose: () => void;
  onSubmit: (title: string) => void | Promise<void>;
};

export default function RenameConversationDialog({
  open,
  initialTitle,
  onClose,
  onSubmit,
}: Props) {
  const [value, setValue] = useState(initialTitle);
  useEffect(() => setValue(initialTitle), [initialTitle, open]);

  const submit = async () => {
    const t = value.trim();
    if (!t) return;
    await onSubmit(t);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Rename conversation</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          fullWidth
          label="Title"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}