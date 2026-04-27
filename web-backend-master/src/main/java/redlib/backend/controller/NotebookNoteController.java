package redlib.backend.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import redlib.backend.annotation.Privilege;
import redlib.backend.dto.NotebookNoteDTO;
import redlib.backend.dto.query.NotebookNoteQueryDTO;
import redlib.backend.model.Page;
import redlib.backend.service.NotebookNoteService;
import redlib.backend.vo.NotebookNoteVO;

import java.util.List;

@RestController
@RequestMapping("/api/notebook/notes")
public class NotebookNoteController {
    @Autowired
    private NotebookNoteService notebookNoteService;

    @PostMapping("list")
    @Privilege
    public Page<NotebookNoteVO> list(@RequestBody(required = false) NotebookNoteQueryDTO queryDTO) {
        return notebookNoteService.list(queryDTO);
    }

    @GetMapping("get")
    @Privilege
    public NotebookNoteVO get(Integer id) {
        return notebookNoteService.get(id);
    }

    @PostMapping("add")
    @Privilege
    public Integer add(@RequestBody NotebookNoteDTO noteDTO) {
        return notebookNoteService.add(noteDTO);
    }

    @PostMapping("update")
    @Privilege
    public Integer update(@RequestBody NotebookNoteDTO noteDTO) {
        return notebookNoteService.update(noteDTO);
    }

    @PostMapping("favorite")
    @Privilege
    public Integer updateFavorite(@RequestBody NotebookNoteDTO noteDTO) {
        return notebookNoteService.updateFavorite(noteDTO);
    }

    @PostMapping("delete")
    @Privilege
    public void delete(@RequestBody List<Integer> ids) {
        notebookNoteService.delete(ids);
    }
}
