package redlib.backend.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import redlib.backend.model.NotebookCategory;
import redlib.backend.model.NotebookCategoryLink;
import redlib.backend.vo.NotebookCategoryStatVO;

import java.util.List;

@Mapper
public interface NotebookCategoryMapper extends BaseMapper<NotebookCategory> {
    @Select("""
            <script>
            select
                nc.note_id as noteId,
                c.id as categoryId,
                c.name as categoryName
            from note_category nc
            inner join category c on c.id = nc.category_id
            where nc.note_id in
            <foreach collection="noteIds" item="noteId" open="(" separator="," close=")">
                #{noteId}
            </foreach>
            order by c.id asc
            </script>
            """)
    List<NotebookCategoryLink> listByNoteIds(@Param("noteIds") List<Integer> noteIds);

    @Select("""
            select
                c.id as categoryId,
                c.name as categoryName,
                count(distinct n.id) as noteCount
            from category c
            left join note_category nc on nc.category_id = c.id
            left join note n on n.id = nc.note_id and n.user_id = c.user_id
            where c.user_id = #{userId}
            group by c.id, c.name
            order by noteCount desc, c.id asc
            """)
    List<NotebookCategoryStatVO> statisticsByUserId(@Param("userId") Integer userId);
}
